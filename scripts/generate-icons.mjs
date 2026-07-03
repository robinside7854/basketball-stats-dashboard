// 아이콘 생성 스크립트
// icon2.png (2048x2048, 농구공 중앙 배치, 그라디언트 배경) 로부터 2가지 버전 생성:
//   1) icon.png (512x512)  - "any" purpose 용, 농구공 크게 크롭 (홈 화면·탭에서 잘 보이도록)
//   2) icon-maskable.png (512x512) - "maskable" purpose 용, 원본 그대로 (마스크 크롭 대비 안전 영역)
//   3) apple-icon.png (180x180) - iOS 홈 화면
//
// 실행: node scripts/generate-icons.mjs

import sharp from 'sharp'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const appDir = join(__dirname, '..', 'src', 'app')
const sourcePath = join(__dirname, 'source-icon.png')

async function generate() {
  const src = sharp(sourcePath)
  const meta = await src.metadata()
  const w = meta.width ?? 0
  const h = meta.height ?? 0
  console.log(`원본: ${w}x${h}`)

  // 원본에서 농구공이 있는 중앙 정사각형 영역 (약 50% 크기) 크롭
  // 원본 2048x2048 기준 → 중앙 1200x1200 정도가 농구공 잘 담김
  const cropSize = Math.floor(Math.min(w, h) * 0.55)  // 원본의 55%
  const cropX = Math.floor((w - cropSize) / 2)
  const cropY = Math.floor((h - cropSize) / 2) - Math.floor(cropSize * 0.05)  // 살짝 위로

  // 1) icon.png - "any" 용 (농구공 크게)
  //    크롭된 정사각형을 512x512 로 리사이즈
  await sharp(sourcePath)
    .extract({ left: cropX, top: cropY, width: cropSize, height: cropSize })
    .resize(512, 512, { fit: 'cover' })
    .png({ quality: 90, compressionLevel: 9 })
    .toFile(join(appDir, 'icon.png'))
  console.log('✓ icon.png (512x512, 농구공 크게)')

  // 2) icon-maskable.png - "maskable" 용 (원본 그대로 리사이즈, 안전 영역 확보)
  await sharp(sourcePath)
    .resize(512, 512, { fit: 'cover' })
    .png({ quality: 90, compressionLevel: 9 })
    .toFile(join(appDir, 'icon-maskable.png'))
  console.log('✓ icon-maskable.png (512x512, 원본 그대로 - 마스크 안전)')

  // 3) apple-icon.png (180x180)
  await sharp(sourcePath)
    .extract({ left: cropX, top: cropY, width: cropSize, height: cropSize })
    .resize(180, 180, { fit: 'cover' })
    .png({ quality: 90, compressionLevel: 9 })
    .toFile(join(appDir, 'apple-icon.png'))
  console.log('✓ apple-icon.png (180x180, 농구공 크게)')

  console.log('\n완료!')
}

generate().catch(err => { console.error(err); process.exit(1) })
