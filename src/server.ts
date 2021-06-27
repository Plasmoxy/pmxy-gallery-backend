import express from 'express'
import cors from 'cors'
import bodyParser from 'body-parser'
import low from 'lowdb'
import FileSync from 'lowdb/adapters/FileSync'
import { Gallery, GalleryImage, DbModel } from './model'
import fs, { readFileSync } from 'fs'
import { StatusCodes } from 'http-status-codes'
import multer from 'multer'
import sharp from 'sharp'
import dotenv from 'dotenv'
import https from 'https'
import basicAuth from 'express-basic-auth'
dotenv.config()

// setup
const PORT = 8099
const app = express()
app.use(cors())
app.use(bodyParser.json())

// static dirs
if (!fs.existsSync('images')) fs.mkdirSync('images')
if (!fs.existsSync('thumbs')) fs.mkdirSync('thumbs')
app.use('/images', express.static('images'))
app.use('/thumbs', express.static('thumbs'))

// uploads
const imageUploadStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'images/')
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname.replace('.', `-${Date.now()}.`))
  }
})
const imageUpload = multer({storage: imageUploadStorage})

// db
const adapter = new FileSync<DbModel>("db.json")
const db = low(adapter)

// db defaults
db.defaults({
  galleries: [] as Gallery[]
}).write()


// auth middleware:
const authorize = basicAuth({
  authorizeAsync: true,
  authorizer: async (uname, pass, auth) => {
    auth(null, uname === "admin" && pass === "ihlicnan")
  },
})

async function init() {
  
  /* Root */
  app.get("/", (req, res) => {
    res.json({status: "OK"})
  })
  
  /* Galleries */
  
  // get galleries just name and image
  app.get("/gallery", (req, res) => {
    res.json(db.get("galleries").map(({name, image}) => ({name, image})).value())
  })
  
  app.get("/gallery/:name", (req, res) => {
    const gal = db.get("galleries").find({name: req.params.name}).value()
    if (gal) {
      res.json(gal)
    } else {
      res.sendStatus(StatusCodes.NOT_FOUND)
    }
  })
  
  app.get("/auth", authorize, (req, res) => {
    res.sendStatus(StatusCodes.OK)
  })
  
  app.post("/gallery", authorize, (req, res) => {
    if (!req.body || !req.body.name) {
      res.sendStatus(StatusCodes.BAD_REQUEST)
    }
    // if exits some gallery like this
    else if (db.get("galleries").some({name: req.body.name}).value()) {
      res.sendStatus(StatusCodes.CONFLICT)
    }
    else {
      // new gallerry
      const name = req.body?.name ?? "error"
      const newGallery: Gallery = {
        name,
        image: undefined,
        images: [],
      }
      db.get("galleries").push(newGallery).write()
      
      res.json(newGallery)
    }
  })
  
  app.delete("/gallery/:name", authorize, (req, res) => {
    db.get("galleries").remove({name: req.params.name}).write()
    res.sendStatus(StatusCodes.OK)
  })
  
  app.post("/gallery/:galleryName", authorize, imageUpload.single('image'), async (req, res) => {
    
    // find gallery
    const targetGallery = db.get("galleries").find({name: req.params.galleryName})
    
    // that gallery was not found
    if (!targetGallery.value()) {
      res.sendStatus(StatusCodes.NOT_FOUND)
      return
    }
    
    // new image
    const name = req.file.filename
    let originalNameArr = req.file.originalname.split('.')
    originalNameArr.length--;
    const title = originalNameArr.join('')
    
    const newImage: GalleryImage = { name, title }
    
    // construct thumbnail
    const resized = await sharp(`images/${name}`)
        .resize({width: 300})
        .toFile(`thumbs/${name}`)
    
    
    // save to gallery
    targetGallery.get("images").push(newImage).write()
    
    // set gallery image if this one is the first
    if (targetGallery.get("images").size().value() == 1) {
      targetGallery.set("image", newImage).write()
    }
        
    res.json(newImage)
  })
  
  // delete image inside gallery
  app.delete("/gallery/:galleryName/:imageName", authorize, (req, res) => {
    // find gallery
    const gal = db.get("galleries").find({name: req.params.galleryName})
    if (!gal.value()) {
      res.sendStatus(StatusCodes.NOT_FOUND)
      return
    }
    
    // find the image inside gallery and delete it
    gal.get("images").remove({name: req.params.imageName}).write()
    
    res.sendStatus(StatusCodes.OK)
  })
  
}

init().then(() => {
  
  const port = process.env.port ?? 8089
  
  if (process.env.dev === "true") {
    
    app.listen(port, () => {
      console.log("=== Pmxy Gallery Server ===")
      console.log(`Listening on development port ${port}`)
    })
  
  } else {
    // vps-specific key locations (add them in your .env)
    https.createServer({
      key: readFileSync(process.env.key ?? ""),
      cert: readFileSync(process.env.cert ?? "")
    }, app)
    .listen(port, () => {
      console.log("=== Pmxy Gallery Server ===")
      console.log(`Listening on port ${port}`)
    })
  }
  
})

