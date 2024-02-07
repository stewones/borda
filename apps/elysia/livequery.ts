import { Elysia } from 'elysia';

const app = new Elysia()
  .state('start', 'here')
  .ws('/:collectionName', {
    open(ws) {
      ws.subscribe('asdf');
      console.log('Open Connection:', ws.id);
    },
    close(ws) {
      console.log('Closed Connection:', ws.id);
    },
    message(ws, message) {
      ws.publish('asdf', message);
    },
  })
  .get('/publish/:publish', ({ params: { publish: text } }) => {
    app.server!.publish('asdf', text);

    return text;
  })
  .listen(8080, (server) => {
    console.log(`http://${server.hostname}:${server.port}`);
  });
