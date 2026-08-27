FROM node:18-bullseye
WORKDIR /app

# 1. HANYA salin package.json (mengabaikan package-lock.json agar tidak bentrok)
COPY package.json ./

# 2. Bersihkan cache npm dan lakukan install
RUN npm cache clean --force && npm install

# 3. Salin sisa file kode
COPY . .

# 4. Jalankan aplikasi
CMD ["npm", "run", "dev"]