export type DbModel = {
  galleries: Gallery[],
}

export type GalleryImage = {
  name: string,
  title: string,
}

export type Gallery = {
  name: string,
  image?: GalleryImage,
  images: GalleryImage[]
}

