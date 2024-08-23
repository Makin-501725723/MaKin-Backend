import dotenv from 'dotenv'
dotenv.config()
import * as fs from 'fs'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import createError from 'http-errors'
import express from 'express'
import logger from 'morgan'
import path from 'path'
import session from 'express-session'

// for spotify
import axios from 'axios'
import querystring from 'querystring'
const spotify_client_id = process.env.SPOTIFY_CLIENT_ID
const spotify_client_secret = process.env.SPOTIFY_CLIENT_SECRET
const redirect_uri = 'https://makin-music-backend.vercel.app/callback'

// 使用內建的 MemoryStore
const MemoryStore = session.MemoryStore

// 修正 ESM 中的 __dirname 與 windows os 中的 ESM dynamic import
import { fileURLToPath, pathToFileURL } from 'url'
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 讓console.log呈現檔案與行號，與字串訊息呈現顏色用
import { extendLog } from '#utils/tool.js'
import 'colors'
extendLog()

// 建立 Express 應用程式
const app = express()

// cors設定，參數為必要，注意不要只寫`app.use(cors())`
app.use(
  cors({
    origin: ['https://makin-music.vercel.app', 'https://accounts.spotify.com'],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['Set-Cookie'],
  })
)

// 視圖引擎設定
app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'pug')

// 記錄HTTP要求
app.use(logger('dev'))
// 剖析 POST 與 PUT 要求的JSON格式資料
app.use(express.json())
app.use(express.urlencoded({ extended: false }))
// 剖折 Cookie 標頭與增加至 req.cookies
app.use(cookieParser())
// 在 public 的目錄，提供影像、CSS 等靜態檔案
app.use(express.static(path.join(__dirname, 'public')))

// 使用 MemoryStore 來記錄 session
app.use(
  session({
    store: new MemoryStore({ checkPeriod: 86400000 }),
    name: 'SESSION_ID',
    secret: process.env.SESSION_SECRET,
    cookie: {
      maxAge: 30 * 86400000, // 30 天
      httpOnly: true,
      secure: true,
      sameSite: 'None',
    },
    resave: false,
    saveUninitialized: false,
  })
)

// 跟著spotify 專案做 chatgpt.ver
app.get('/login', (req, res) => {
  const scope =
    'streaming user-read-email user-read-private ugc-image-upload user-read-playback-state user-modify-playback-state user-read-currently-playing app-remote-control playlist-read-private playlist-read-collaborative playlist-modify-private playlist-modify-public user-follow-modify user-follow-read user-read-playback-position user-top-read user-read-recently-played user-library-modify user-library-read'

  const authUrl =
    'https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id: spotify_client_id,
      scope: scope,
      redirect_uri: redirect_uri,
    })
  res.redirect(authUrl)
})

app.get('/callback', async (req, res) => {
  const code = req.query.code || null
  try {
    const response = await axios.post(
      'https://accounts.spotify.com/api/token',
      querystring.stringify({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirect_uri,
        client_id: spotify_client_id,
        client_secret: spotify_client_secret,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    )

    const { access_token, refresh_token } = response.data
    // 重定向到前端的一個特定頁面，並附帶 token
    res.redirect(
      `https://makin-music.vercel.app/auth/callback#access_token=${access_token}&refresh_token=${refresh_token}`
    )
  } catch (error) {
    res.send(error)
  }
})

// 載入 routes 中的各路由檔案，並套用 api 路由 START
const apiPath = '/api' // 預設路由
const routePath = path.join(__dirname, 'routes')
const filenames = await fs.promises.readdir(routePath)

for (const filename of filenames) {
  const item = await import(pathToFileURL(path.join(routePath, filename)))
  const slug = filename.split('.')[0]
  app.use(`${apiPath}/${slug === 'index' ? '' : slug}`, item.default)
}
// 載入 routes 中的各路由檔案，並套用 api 路由 END

// 捕抓 404 錯誤處理
app.use(function (req, res, next) {
  next(createError(404))
})

// 錯誤處理函式
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message
  res.locals.error = req.app.get('env') === 'development' ? err : {}

  // render the error page
  res.status(err.status || 500)
  // 更改為錯誤訊息預設為 JSON 格式
  res.status(500).send({ error: err })
})

export default app
