// 클라이언트 이미지 압축 유틸
//
// Vercel 서버리스는 요청 본문 크기 제한이 있어 (기본 4-4.5MB) 원본 사진
// 그대로 업로드하면 413 (Payload Too Large) 에러 발생. 업로드 전 리사이즈+JPEG 압축.
//
// 기본값:
//   maxW=600, maxH=800  — 프로필 카드 표시에 충분 (retina 감안)
//   quality=0.82         — 시각 품질 저하 거의 없음, 파일크기 대폭 감소

export async function compressImage(
  file: File,
  maxW = 600,
  maxH = 800,
  quality = 0.82,
): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img
      if (width > maxW || height > maxH) {
        const ratio = Math.min(maxW / width, maxH / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        blob => {
          if (!blob) return reject(new Error('compress failed'))
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }))
        },
        'image/jpeg',
        quality,
      )
    }
    img.onerror = reject
    img.src = url
  })
}
