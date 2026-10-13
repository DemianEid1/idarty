'use client'

import { useState, useTransition } from 'react'
import { saveServiceImage, removeServiceImage, saveServiceImageCrop } from '@/app/[locale]/tenants/[slug]/dashboard/service-image-actions'
import { MAX_SERVICE_IMAGE_SIZE, SUPPORTED_IMAGE_MIME_TYPES } from '@/lib/image-validation'
import { ImageCropper } from '@/components/image-cropper'
import { CROP_ASPECTS, cropToLayerStyle, resolveCrop, type ImageCrop } from '@/lib/image-crop'
import type { Locale } from '@/lib/i18n'
import { useToast } from '@/components/toast'

/**
 * Service image control: upload / replace / remove / crop.
 *
 * Uploading and cropping are deliberately separate steps:
 *   1. choosing a file validates it and opens the cropper;
 *   2. confirming the crop is what actually saves the image.
 * That means Cancel discards the pending file and leaves whatever was already
 * stored completely untouched — nothing is overwritten until the user confirms.
 *
 * Re-cropping an existing image never re-uploads or re-encodes it: only the crop
 * metadata changes, so it stays lossless and can be re-adjusted repeatedly.
 */
export function ServiceImageForm({
  locale,
  slug,
  serviceId,
  currentImage,
  currentCrop,
}: {
  locale: Locale
  slug: string
  serviceId: string
  currentImage?: string | null
  currentCrop?: ImageCrop | null
}) {
  const rtl = locale === 'ar'
  const { toast } = useToast()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState('')
  // The image being cropped. When `isNew` it has not been saved yet, so Cancel
  // simply drops it.
  const [cropping, setCropping] = useState<{ dataUrl: string; isNew: boolean } | null>(null)

  const hasCrop = resolveCrop(currentCrop) !== null

  /** Validate a picked file, then open the cropper for it. */
  function handleFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    // Validation is unchanged and still uses the SAME constants the server
    // enforces, so cropping can never bypass the MIME/size rules.
    if (!(SUPPORTED_IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) {
      toast('error', rtl ? 'نوع الصورة غير مدعوم. يُسمح بـ JPEG و PNG و WebP فقط.' : 'Unsupported image type. Only JPEG, PNG, and WebP are allowed.')
      return
    }
    if (file.size > MAX_SERVICE_IMAGE_SIZE) {
      toast('error', rtl ? 'حجم الصورة كبير جداً. الحد الأقصى 500 كيلوبايت.' : 'Image is too large. Maximum size is 500KB.')
      return
    }

    const reader = new FileReader()
    reader.onload = (event) => {
      const dataUrl = event.target?.result
      if (typeof dataUrl === 'string') {
        setMessage('')
        setCropping({ dataUrl, isNew: true })
      }
    }
    reader.readAsDataURL(file)
  }

  /** Save a NEW image together with the crop the user framed. */
  function saveNewImage(dataUrl: string, crop: ImageCrop) {
    setMessage('')
    startTransition(async () => {
      try {
        const result = await saveServiceImage({
          slug,
          locale,
          serviceId,
          imageBase64: dataUrl,
          crop,
        })
        if (result.ok) {
          const msg = rtl ? 'تم حفظ صورة الخدمة.' : 'Service image saved.'
          setMessage(msg)
          toast('success', msg)
        } else {
          const msg = rtl ? `تعذر الحفظ: ${result.error}` : `Could not save: ${result.error}`
          setMessage(msg)
          toast('error', msg)
        }
      } catch {
        const msg = rtl ? 'تعذر حفظ صورة الخدمة.' : 'Could not save service image.'
        setMessage(msg)
        toast('error', msg)
      }
    })
  }

  /** Persist a new crop for the ALREADY-STORED image. No re-upload, no re-encode. */
  function saveExistingCrop(crop: ImageCrop) {
    setMessage('')
    startTransition(async () => {
      try {
        const result = await saveServiceImageCrop({ slug, locale, serviceId, crop })
        if (result.ok) {
          const msg = rtl ? 'تم حفظ الاقتصاص.' : 'Crop saved.'
          setMessage(msg)
          toast('success', msg)
        } else {
          const msg = rtl ? `تعذر الحفظ: ${result.error}` : `Could not save: ${result.error}`
          setMessage(msg)
          toast('error', msg)
        }
      } catch {
        const msg = rtl ? 'تعذر حفظ الاقتصاص.' : 'Could not save crop.'
        setMessage(msg)
        toast('error', msg)
      }
    })
  }

  function handleRemove() {
    startTransition(async () => {
      try {
        const result = await removeServiceImage({ slug, locale, serviceId })
        if (result.ok) {
          const msg = rtl ? 'تمت إزالة صورة الخدمة.' : 'Service image removed.'
          setMessage(msg)
          toast('success', msg)
        } else {
          const msg = rtl ? `تعذر الإزالة: ${result.error}` : `Could not remove: ${result.error}`
          setMessage(msg)
          toast('error', msg)
        }
      } catch {
        const msg = rtl ? 'تعذر إزالة صورة الخدمة.' : 'Could not remove service image.'
        setMessage(msg)
        toast('error', msg)
      }
    })
  }

  const layer = cropToLayerStyle(currentCrop)

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-2">
        {currentImage ? (
          <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-lg border border-[#e1e5ed]">
            {layer ? (
              <div style={layer}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={currentImage} alt="" className="h-full w-full object-cover" style={{ maxWidth: 'none' }} />
              </div>
            ) : (
              <img src={currentImage} alt="" className="h-full w-full object-cover" />
            )}
          </div>
        ) : (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-dashed border-[#e1e5ed] bg-surface">
            <span className="text-[8px] text-ink-lighter">{rtl ? 'لا' : '—'}</span>
          </div>
        )}

        <label className="cursor-pointer rounded-lg border border-[#e1e5ed] bg-paper px-2 py-1 text-[11px] font-semibold text-[#516078] transition hover:bg-surface">
          {currentImage ? (rtl ? 'تغيير' : 'Change') : (rtl ? 'إضافة صورة' : 'Add image')}
          <input
            type="file"
            accept="image/png, image/jpeg, image/webp"
            className="hidden"
            onChange={handleFilePicked}
          />
        </label>

        {currentImage && (
          <button
            type="button"
            disabled={pending}
            onClick={() => setCropping({ dataUrl: currentImage, isNew: false })}
            className="rounded-lg border border-[#e1e5ed] bg-paper px-2 py-1 text-[11px] font-semibold text-[#516078] transition hover:bg-surface"
          >
            {hasCrop ? (rtl ? 'تعديل الاقتصاص' : 'Adjust crop') : (rtl ? 'اقتصاص' : 'Crop')}
          </button>
        )}

        {currentImage && hasCrop && (
          <button
            type="button"
            disabled={pending}
            onClick={() => saveExistingCrop({ x: 0, y: 0, width: 1, height: 1 })}
            className="text-[11px] text-brand-teal hover:underline"
          >
            {rtl ? 'إلغاء الاقتصاص' : 'Remove crop'}
          </button>
        )}

        {currentImage && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={pending}
            className="text-[11px] text-red-600 hover:underline"
          >
            {rtl ? 'إزالة' : 'Remove'}
          </button>
        )}

        {message && <span className="text-[11px] text-[#24865b]" role="status">{message}</span>}
      </div>

      {/* The cropper. Framed at the service card's image ratio, so what the user
          frames is exactly what the card shows. */}
      {cropping && (
        <ImageCropper
          locale={locale}
          image={cropping.dataUrl}
          aspect={CROP_ASPECTS.service}
          initialCrop={cropping.isNew ? null : resolveCrop(currentCrop)}
          title={rtl ? 'اقتصاص صورة الخدمة' : 'Crop service image'}
          onCancel={() => setCropping(null)}
          onConfirm={(crop) => {
            if (cropping.isNew) saveNewImage(cropping.dataUrl, crop)
            else saveExistingCrop(crop)
            setCropping(null)
          }}
        />
      )}
    </div>
  )
}
