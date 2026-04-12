import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from "@zxing/browser"
import { NotFoundException } from "@zxing/library"

interface BarcodeScannerProps {
  onDetected: (barcode: string) => void
  onClose: () => void
}

export default function BarcodeScanner({ onDetected, onClose }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState('')
  const [scanning, setScanning] = useState(true)
  const [detected, setDetected] = useState('')
  const readerRef = useRef<BrowserMultiFormatReader | null>(null)

  useEffect(() => {
    const reader = new BrowserMultiFormatReader()
    readerRef.current = reader

    const start = async () => {
      try {
        // Get available cameras, prefer back camera on mobile
        const devices = await BrowserMultiFormatReader.listVideoInputDevices()
        const backCamera = devices.find(d =>
          d.label.toLowerCase().includes('back') ||
          d.label.toLowerCase().includes('rear') ||
          d.label.toLowerCase().includes('environment')
        )
        const deviceId = backCamera?.deviceId || devices[0]?.deviceId

        if (!deviceId) {
          setError('No camera found on this device.')
          return
        }

        await reader.decodeFromVideoDevice(
          deviceId,
          videoRef.current!,
          (result, err) => {
            if (result) {
              const code = result.getText()
              setDetected(code)
              setScanning(false)
              // Brief pause so user sees the detected code, then callback
              setTimeout(() => {
                onDetected(code)
              }, 800)
            }
            if (err && !(err instanceof NotFoundException)) {
              // NotFoundException is normal — it just means no barcode in frame yet
              console.warn('Scan error:', err)
            }
          }
        )
      } catch (e: any) {
        if (e?.name === 'NotAllowedError') {
          setError('Camera permission denied. Please allow camera access and try again.')
        } else {
          setError('Could not start camera: ' + (e?.message || 'Unknown error'))
        }
      }
    }

    start()

    return () => {
      // Cleanup: stop all streams
      BrowserMultiFormatReader.releaseAllStreams()
    }
  }, [])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="scanner-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>📷 Scan Barcode</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {error ? (
          <div className="scanner-error">
            <div className="scanner-error-icon">⚠️</div>
            <p>{error}</p>
            <button className="btn-secondary" onClick={onClose}>Close</button>
          </div>
        ) : (
          <div className="scanner-body">
            <div className="scanner-viewport">
              <video ref={videoRef} className="scanner-video" />
              {/* Targeting reticle overlay */}
              <div className={`scanner-reticle ${!scanning ? 'detected' : ''}`}>
                <span /><span /><span /><span />
              </div>
              {detected && (
                <div className="scanner-detected-badge">
                  ✓ {detected}
                </div>
              )}
            </div>
            <p className="scanner-hint">
              {scanning
                ? 'Point your camera at a barcode'
                : 'Barcode detected!'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
