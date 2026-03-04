#!/usr/bin/env node

/**
 * 本地 HTTP 服务器，用于提供 Whisper 模型文件
 * 使用方法：
 * 1. 将下载的模型放在指定目录（如 ~/whisper-models/whisper-base/）
 * 2. 运行：node scripts/serve-whisper-models.js ~/whisper-models/whisper-base
 * 3. 在 Voice Control 设置中填入：http://localhost:8765
 */

const http = require('http')
const fs = require('fs')
const path = require('path')

const args = process.argv.slice(2)
const modelDir = args[0] || path.join(process.env.HOME, 'whisper-models', 'whisper-base')
const port = args[1] || 8765

if (!fs.existsSync(modelDir)) {
  console.error(`错误：模型目录不存在: ${modelDir}`)
  console.error(`使用方法：node ${process.argv[1]} <模型目录> [端口]`)
  console.error(`\n示例：node ${process.argv[1]} ~/whisper-models/whisper-base`)
  process.exit(1)
}

// 解析模型目录的绝对路径
const absoluteModelDir = path.resolve(modelDir)

const server = http.createServer((req, res) => {
  // 处理 CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', '*')

  if (req.method === 'OPTIONS') {
    res.writeHead(200)
    res.end()
    return
  }

  console.log(`${req.method} ${req.url}`)

  // 解析请求路径
  // transformers.js 请求格式：/Xenova/whisper-base/resolve/main/config.json
  // 需要映射到：<modelDir>/config.json
  let requestPath = req.url

  // 移除查询参数
  const queryIndex = requestPath.indexOf('?')
  if (queryIndex !== -1) {
    requestPath = requestPath.substring(0, queryIndex)
  }

  // 移除 /Xenova/whisper-base/resolve/main/ 前缀
  requestPath = requestPath.replace(/^\/Xenova\/whisper-[^\/]+\/resolve\/main\//, '/')

  // 构建实际文件路径
  let filePath = path.join(absoluteModelDir, requestPath)

  // 安全检查：防止路径遍历
  const resolvedPath = path.resolve(filePath)
  if (!resolvedPath.startsWith(absoluteModelDir)) {
    console.log(`403 Forbidden: ${req.url} (path traversal attempt)`)
    res.writeHead(403)
    res.end('Forbidden')
    return
  }

  // 检查文件是否存在
  if (!fs.existsSync(resolvedPath)) {
    console.log(`404 Not Found: ${req.url} -> ${resolvedPath}`)
    res.writeHead(404)
    res.end('Not Found')
    return
  }

  // 如果是目录，返回 403
  const stat = fs.statSync(resolvedPath)
  if (stat.isDirectory()) {
    console.log(`403 Forbidden: ${req.url} (is directory)`)
    res.writeHead(403)
    res.end('Forbidden')
    return
  }

  // 读取并返回文件
  const contentType = getContentType(resolvedPath)

  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': stat.size,
  })

  const stream = fs.createReadStream(resolvedPath)
  stream.pipe(res)

  console.log(`200 OK: ${req.url} -> ${path.relative(absoluteModelDir, resolvedPath)} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`)
})

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  const types = {
    '.json': 'application/json',
    '.onnx': 'application/octet-stream',
    '.txt': 'text/plain',
  }
  return types[ext] || 'application/octet-stream'
}

server.listen(port, () => {
  console.log(`\n✓ Whisper 模型服务器已启动`)
  console.log(`  模型目录: ${absoluteModelDir}`)
  console.log(`  服务地址: http://localhost:${port}`)
  console.log(`\n在 Voice Control 设置中填入: http://localhost:${port}`)
  console.log(`\n等待请求...\n`)
})
