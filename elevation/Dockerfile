FROM node:latest

# Create app directory
RUN mkdir -p /app
WORKDIR /app

# Install app dependencies
COPY package.json /app/
RUN npm install

# Bundle app source
COPY . /app
RUN bzip2 -d /app/node_modules/elevation/data/elev.bin.bz2
EXPOSE 8000
CMD [ "npm", "start" ]
