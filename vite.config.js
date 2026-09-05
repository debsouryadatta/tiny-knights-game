import {defineConfig} from 'vite';
export default defineConfig({
  server:{host:'0.0.0.0',port:4177,strictPort:true,allowedHosts:['tops-still-basilisk.ngrok-free.app'],fs:{deny:['.env','.env.*','*.{crt,pem,key}','**/.git/**','**/.runtime/**','**/.data/**','**/.tools/**']},proxy:{'/api':{target:'http://127.0.0.1:4176',changeOrigin:false}}},
  worker:{format:'es'},
  optimizeDeps:{exclude:['needle-rs']},
  build:{rollupOptions:{input:{main:'index.html',explore:'explore.html'}}}
});
