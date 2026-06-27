FROM node:18-slim

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package.json package.json
RUN npm install --production

# Bundle app source
COPY . .

# Expose port and run
ENV PORT=3000
EXPOSE 3000

CMD [ "node", "server.js" ]
