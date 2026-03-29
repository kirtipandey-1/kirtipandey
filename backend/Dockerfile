FROM node:20-slim

WORKDIR /app

RUN apt-get update && apt-get install -y python3 python3-pip ffmpeg --no-install-recommends \
    && pip3 install spotdl --break-system-packages \
    && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install --production

COPY . .

EXPOSE 4000

CMD ["node", "server.js"]
