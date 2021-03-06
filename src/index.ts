import express from 'express'
import { createEventAdapter } from '@slack/events-api'
import { WebClient } from '@slack/web-api'
import { createServer } from 'http'
import fetch from 'node-fetch'

const app = express()
const slackEvents = createEventAdapter(process.env.SIGNING_SECRET)
const webClient = new WebClient(process.env.BOT_USER_OAUTH_ACCESS_TOKEN)
const channelName = process.env.CHANNEL_NAME

interface HouseParam {
  type: string
  floor: string
  rent: string
  commonfee: string
}
const checkConditions = (house: HouseParam): boolean => {
  const checkType = ['2LDK', '3K', '3DK', '3LDK'].includes(house.type)

  const floor = parseInt(house.floor.replace('階', ''), 10) || 0
  const checkFloor = floor >= 2

  const reg = /(,|円)/gi
  const totalRent = parseInt(house.rent.replace(reg, ''), 10) + parseInt(house.commonfee.replace(reg, ''), 10)
  const checkTotalRent = totalRent <= 200000

  return checkType && checkFloor && checkTotalRent
}

interface Param {
  name: string
  danchi: number
}

interface UrHouse {
  name: string
  madori: string
  roomDetailLink: string
}

const getUrInformation = async (param: Param): Promise<UrHouse[]> => {
  const bodyJson = {
    shisya: 20,
    danchi: param.danchi,
    shikibetu: 0,
    orderByField: 0,
    orderBySort: 0,
    pageIndex: 0,
    sp: 'sp',
  }

  return new Promise(resolve => {
    fetch('https://chintai.sumai.ur-net.go.jp/chintai/api/bukken/detail/detail_bukken_room/', {
      method: 'post',
      body: JSON.stringify(bodyJson),
      headers: { 'Content-Type': 'application/json' },
    })
      .then(res => res.json())
      .then(json => {
        if (Array.isArray(json)) {
          const result = json.reduce((results, house) => {
            if (checkConditions(house)) {
              const info: UrHouse = {
                name: param.name,
                madori: house.madori,
                roomDetailLink: `https://www.ur-net.go.jp${house.roomDetailLink}`,
              }
              results.push(info)
            }
            return results
          }, [])
          return resolve(result)
        }
        return resolve([])
      })
  })
}

const urListForCheck = [
  { name: 'フレーシェル王子神谷 (東京都北区)', danchi: 600 },
  { name: 'フレール西経堂 (東京都世田谷区)', danchi: 544 },
]
const sendResult = async () => {
  const results = await Promise.all(urListForCheck.map(ur => getUrInformation(ur)))
  const messages = []
  results.forEach(result => {
    if (result.length) {
      messages.push(`${result[0].name} => ${result.length}件`)
      result.forEach(item => {
        messages.push(`- 間取り：${item.madori}\n - Link：${item.roomDetailLink}`)
      })
    }
  })

  if (!messages.length) {
    messages.push('検索結果なし。')
  }

  for (const message of messages) {
    await webClient.chat.postMessage({
      text: message,
      channel: channelName,
    })
  }
}

const intervalTime = 1000 * 60 * 30 // 30min
let interval: NodeJS.Timeout

slackEvents.on('message', async event => {
  console.log(event)

  if (event.text === 'お元気ですか？') {
    webClient.chat.postMessage({
      text: 'はい！私は元気です！',
      channel: event.channel,
    })
  } else if (event.text === '今かい？！') {
    sendResult()
  } else if (event.text === '教えて！') {
    webClient.chat.postMessage({
      text: 'はい！これから、30分ごとに報告します！',
      channel: event.channel,
    })
    sendResult()
    if (!interval) {
      console.log('start interval')
      interval = setInterval(sendResult, intervalTime)
    }
  } else if (event.text === 'やめて！') {
    webClient.chat.postMessage({
      text: 'はい！、報告をやめます！',
      channel: event.channel,
    })
    console.log('clear interval')
    clearInterval(interval)
    interval = undefined
  }
})

app.use('/slack/events', slackEvents.requestListener())

const port = process.env.PORT || 5000
createServer(app).listen(port, () => {
  console.log(`House-Bot is running on PORT:${port}`)
})
