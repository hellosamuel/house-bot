import express from 'express'
import { createEventAdapter } from '@slack/events-api'
import { WebClient } from '@slack/web-api'
import { createServer } from 'http'

const app = express()
const slackEvents = createEventAdapter(process.env.SIGNING_SECRET)
const webClient = new WebClient(process.env.BOT_USER_OAUTH_ACCESS_TOKEN)
const channelName = process.env.CHANNEL_NAME

let interval: NodeJS.Timeout
const sendResult = () => {
  webClient.chat.postMessage({
    text: 'Test Message',
    channel: channelName
  })
}

slackEvents.on('message', async event => {
  console.log(event)

  if (event.text === 'お元気ですか？') {
    webClient.chat.postMessage({
      text: 'はい！私は元気です！',
      channel: event.channel
    })
  }

  if (event.text === '教えて！') {
    webClient.chat.postMessage({
      text: 'はい！これから、1時間ごとに報告します！',
      channel: event.channel
    })
    if (!interval) {
      interval = setInterval(sendResult, 5000)
    }
  }

  if (event.text === 'やめて！') {
    webClient.chat.postMessage({
      text: 'はい！、報告をやめます！',
      channel: event.channel
    })
    clearInterval(interval)
  }
})

app.use('/slack/events', slackEvents.requestListener())

createServer(app).listen(8080, () => {
  console.log('run house bot')
})