/* Vite 多页产物、PWA 更新与 ESM 页面冒烟验证，不需要后端。 */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'
import { chromium } from 'playwright'
import process from 'node:process'

const root = resolve('dist')
const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png' }
const server = createServer(async (request,response) => {
  let path = decodeURIComponent(new URL(request.url,'http://x').pathname)
  if(path==='/')path='/index.html';if(path==='/admin/')path='/admin/index.html'
  try{const file=join(root,normalize(path));response.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream'});response.end(await readFile(file))}
  catch{response.writeHead(404).end('not found')}
})
await new Promise(done=>server.listen(0,done))
const address=server.address();if(!address||typeof address==='string')throw new Error('静态服务器启动失败')
const base=`http://127.0.0.1:${address.port}`
const browser=await chromium.launch(process.env.E2E_BROWSER_CHANNEL?{channel:process.env.E2E_BROWSER_CHANNEL}:{})
const page=await browser.newPage();const errors=[]
page.on('console',message=>{if(message.type()==='error')errors.push(message.text())})
page.on('pageerror',error=>errors.push('pageerror: '+error.message))
await page.route('https://**/*',route=>route.fulfill({status:204,contentType:'image/png',body:''}))
await page.route('**/api/**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({code:'OK',message:'success',requestId:'verify',data:{recentJournals:[],recentTrips:[],cityMarkers:[],tripCount:0,cityCount:0,journalCount:0,photoCount:0,displayName:'验证用户',avatarUrl:null,themeKey:null,theme:null}})}))
await page.route('**/api/public/trips',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({code:'OK',message:'success',requestId:'trips',data:[{id:1,title:'京都之旅',slug:'kyoto',status:'COMPLETED',startDate:'2026-04-01',endDate:'2026-04-05',cities:['京都'],journalCount:3,coverUrl:null},{id:2,title:'冰岛环岛',slug:'iceland',status:'COMPLETED',startDate:'2025-10-01',endDate:'2025-10-08',cities:['雷克雅未克'],journalCount:5,coverUrl:null}]})}))

await page.goto(base+'/',{waitUntil:'networkidle'})
const pwa=await page.evaluate(async()=>{const manifest=await fetch('/app-manifest.json',{cache:'no-store'}).then(response=>response.json());const registration=await navigator.serviceWorker.ready;await new Promise(done=>setTimeout(done,100));const cache=await caches.open('tj-shell-'+manifest.version);const missing=[];for(const asset of manifest.assets)if(!(await cache.match(asset)))missing.push(asset);return{version:manifest.version,scriptUrl:registration.active?.scriptURL||'',missing}})
await page.evaluate(()=>{location.hash='#/trips'})
await page.waitForSelector('.filter-row .chip')
await page.locator('.filter-row .chip').filter({hasText:/^2025$/}).click()
await page.waitForFunction(()=>[...document.querySelectorAll('.journal-card h3')].map(node=>node.textContent).join(',')==='冰岛环岛')
const state=await page.evaluate(()=>({title:document.querySelector('.page-title h1')?.textContent,globals:['TravelApi','TravelTheme','TravelThemeEffects','TravelMap','JournalBlocks','JournalMedia','LocalDraft','DayRoute','AdminShared','AdminPages'].filter(key=>key in window)}))
await page.goto(base+'/theme-card-preview.html',{waitUntil:'networkidle'})
const preview=await page.evaluate(()=>({
  title:document.querySelector('.mini-hero h1')?.textContent,
  blocks:document.querySelectorAll('.journal-block').length,
  photoHeight:document.querySelector('.mini-photo')?.getBoundingClientRect().height||0,
  summaryBottom:document.querySelector('.journal-day-summary')?.getBoundingClientRect().bottom||Infinity,
  viewportHeight:innerHeight,
  documentDisplay:getComputedStyle(document.querySelector('.journal-document')).display,
  globals:['TravelTheme','JournalBlocks','TravelThemeEffects'].filter(key=>key in window),
}))

const checks=[
  ['清单版本存在',Boolean(pwa.version)],['Service Worker 使用本次版本',pwa.scriptUrl.includes('build='+pwa.version)],['全部 hash 产物已缓存',pwa.missing.length===0],
  ['公开 Trips SFC 可路由和筛选',state.title==='旅行'],['旧 window 全局已清空',state.globals.length===0],
  ['主题卡片 ESM 入口可渲染',preview.title==='路上的夏天'&&preview.blocks===5],
  ['主题卡片保持微缩日记构图',preview.photoHeight<260&&preview.summaryBottom<=preview.viewportHeight&&preview.documentDisplay==='grid'],
  ['主题卡片无旧全局',preview.globals.length===0],['页面无控制台错误',errors.length===0],
]
let failed=false;for(const [name,ok] of checks){console.log(ok?'通过 ':'失败 ',name);if(!ok)failed=true}
if(state.globals.length||preview.globals.length)console.error('残留全局：'+[...state.globals,...preview.globals].join(','));if(pwa.missing.length)console.error('缺少缓存：'+pwa.missing.join(','));if(errors.length)console.error(errors.join('\n'))
await browser.close();await new Promise(done=>server.close(done));if(failed)process.exitCode=1;else console.log('\n全部通过')
