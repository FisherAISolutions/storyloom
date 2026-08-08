import * as React from "react"
import { cn } from "@/lib/utils"

const FALLBACK_IMAGE_URL = "/images/image-placeholder.svg"

/**
 * A small, host-agnostic image wrapper for local assets, signed Supabase URLs,
 * and normal HTTPS images. Failed and empty sources use a checked-in fallback.
 */
const Image = React.forwardRef(
  (
    {
      src,
      fittingType = "fill",
      originWidth,
      originHeight,
      focalPointX,
      focalPointY,
      className,
      style,
      onError,
      alt = "",
      quality: _quality,
      ...props
    },
    ref
  ) => {
    const [imgSrc, setImgSrc] = React.useState(src || FALLBACK_IMAGE_URL)

    React.useEffect(() => {
      setImgSrc(src || FALLBACK_IMAGE_URL)
    }, [src])

    const isFallback = imgSrc === FALLBACK_IMAGE_URL
    const aspectRatio = originWidth && originHeight ? `${originWidth} / ${originHeight}` : undefined
    const objectPosition =
      typeof focalPointX === "number" && typeof focalPointY === "number"
        ? `${focalPointX * 100}% ${focalPointY * 100}%`
        : undefined

    return (
      <img
        ref={ref}
        src={imgSrc}
        alt={alt}
        loading="lazy"
        className={cn(fittingType === "fit" ? "object-contain" : "object-cover", className)}
        style={{ aspectRatio, objectPosition, ...style }}
        onError={(event) => {
          onError?.(event)
          if (!isFallback) setImgSrc(FALLBACK_IMAGE_URL)
        }}
        data-empty-image={!src || undefined}
        data-error-image={isFallback && Boolean(src) ? true : undefined}
        {...props}
      />
    )
  }
)
Image.displayName = "Image"

export { Image }
