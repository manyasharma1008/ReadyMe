import { ENDPOINTS } from './config'
import { apiPost } from './client'

function stripDataUrlPrefix(image) {
  if (!image || typeof image !== 'string') return image
  return image.includes(',') ? image.split(',')[1] : image
}

export async function generateVirtualTryOn({
  personImage,
  garmentImage,
  measurements,
  product = null,
  sizeRecommendation = null,
}) {
  return apiPost(
    ENDPOINTS.VTO_GENERATE,
    {
      person_image: stripDataUrlPrefix(personImage),
      garment_image: garmentImage,
      measurements,
      product,
      size_recommendation: sizeRecommendation,
    },
    180000
  )
}
