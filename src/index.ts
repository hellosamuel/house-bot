import express from 'express'
import { createEventAdapter } from '@slack/events-api'
import { WebClient } from '@slack/web-api'
import { createServer } from 'http'
import fetch from 'node-fetch'

const app = express()
const slackEvents = createEventAdapter(process.env.SIGNING_SECRET)
const webClient = new WebClient(process.env.BOT_USER_OAUTH_ACCESS_TOKEN)
const channelName = process.env.CHANNEL_NAME

interface UrHouse {
  madori: string
  roomDetailLink: string
}

const getUrInformation = async (): Promise<UrHouse[]> => {
  // フレーシェル王子神谷 (東京都北区)
  const bodyJson = {
    shisya: 20,
    danchi: 600,
    shikibetu: 0,
    orderByField: 0,
    orderBySort: 0,
    pageIndex: 0,
    sp: 'sp',
  }

  return new Promise(resolve => {
    fetch(
      'https://chintai.sumai.ur-net.go.jp/chintai/api/bukken/detail/detail_bukken_room/',
      {
        method: 'post',
        body: JSON.stringify(bodyJson),
        headers: { 'Content-Type': 'application/json' },
      }
    )
      .then(res => res.json())
      .then(json => {
        if (json) {
          const result = json.map((house: UrHouse) => ({
            madori: house.madori,
            roomDetailLink: `https://www.ur-net.go.jp${house.roomDetailLink}`,
          }))
          return resolve(result)
        }
        return resolve([])
      })
  })
}

const intervalTime = 1000 * 60 * 30 // 30min
let interval: NodeJS.Timeout
const sendResult = async () => {
  const result = await getUrInformation()
  const texts = [
    'フレーシェル王子神谷 (東京都北区)　空室状況の報告',
    `現在空室は：${result.length}件`,
  ]

  if (result) {
    result.forEach(item => {
      texts.push(`- 間取り：${item.madori}\n - Link：${item.roomDetailLink}`)
    })
  }

  for (const text of texts) {
    await webClient.chat.postMessage({
      text,
      channel: channelName,
    })
  }
}

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
    setTimeout(sendResult, 0) // 1回実行
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

createServer(app).listen(process.env.PORT || 5000, () => {
  console.log('run house bot')
})
