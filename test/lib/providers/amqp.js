'use strict';

const EventEmitter = require('events').EventEmitter;
const util = require('util');
const proxyquire = require('proxyquire').noCallThru();
const sinon = require('sinon');
const tap = require('tap');

function AmqpQueueStub() { }
function AmqpExchangeStub() { }
function AmqpConnectionStub() { }
function SubscribePromise() { }

util.inherits(AmqpConnectionStub, EventEmitter);

const amqpStub = { createConnection: sinon.stub() };

const AmqpProvider = proxyquire('../../../lib/providers/amqp', {
  amqp: amqpStub,
});

const fakeConsumerTag = 'test123';

function createProvider(emitter, options) {
  return new AmqpProvider(emitter, options);
}

function emitFakeReady(provider) {
  // Defer this emit since provider is initialized on next event loop
  setImmediate(() => provider.connection.emit('ready'));
}

tap.beforeEach((done) => {
  amqpStub.createConnection = sinon.stub().returns(new AmqpConnectionStub());

  SubscribePromise.prototype.addCallback = sinon.stub().callsArgWith(0, {
    consumerTag: fakeConsumerTag,
  });

  AmqpConnectionStub.prototype.disconnect = sinon.stub();
  AmqpConnectionStub.prototype.exchange = sinon.stub().callsArgWith(2, new AmqpExchangeStub());
  AmqpConnectionStub.prototype.queue = sinon.stub().callsArgWith(2, new AmqpQueueStub());

  AmqpExchangeStub.prototype.destroy = sinon.stub();
  AmqpExchangeStub.prototype.publish = sinon.stub();

  AmqpQueueStub.prototype.bind = sinon.stub().callsArg(2);
  AmqpQueueStub.prototype.destroy = sinon.stub();
  AmqpQueueStub.prototype.subscribe = sinon.stub().returns(new SubscribePromise());
  AmqpQueueStub.prototype.unbind = sinon.stub();
  AmqpQueueStub.prototype.unsubscribe = sinon.stub();

  done();
});

tap.test('Throws an error if `emitter` arg is not set', (t) => {
  t.throws(() => createProvider(), { message: /emitter.+not.+set/i });
  t.end();
});

tap.test('Throws an error if `options` args is not set', (t) => {
  t.throws(() => createProvider({}), { message: /options.+not.+set/i });
  t.end();
});

tap.test('Throws an error if `options` args is missing `queueName` property', (t) => {
  const providerOptions = {};

  t.throws(() => createProvider({}, providerOptions), { message: /queueName.+not.+set/i });
  t.end();
});

tap.test('Throws an error if `options` args is missing `exchangeName` property', (t) => {
  const providerOptions = { queueName: 'queue' };

  t.throws(() => createProvider({}, providerOptions), { message: /exchangeName.+not.+set/i });
  t.end();
});

tap.test('Does not throw an error if args are valid', (t) => {
  const providerOptions = {
    queueName: 'queue',
    exchangeName: 'exchange',
  };

  sinon.stub(AmqpProvider.prototype, 'initProvider', noop => noop);
  t.doesNotThrow(() => createProvider({}, providerOptions));
  setImmediate(() => {
    AmqpProvider.prototype.initProvider.restore();
    t.end();
  });
});

tap.test('Creates a connection with provider options', (t) => {
  const providerOptions = {
    queueName: 'queue',
    exchangeName: 'exchange',
  };

  createProvider(new EventEmitter(), providerOptions);

  // Defer these tests since provider is initialized on next event loop
  setImmediate(() => {
    t.ok(amqpStub.createConnection.called);
    t.equal(amqpStub.createConnection.getCall(0).args[0], providerOptions);
    t.end();
  });
});

tap.test('Creates an exchange using specified name', (t) => {
  const providerOptions = {
    queueName: 'queue',
    exchangeName: 'exchange',
  };
  const provider = createProvider(new EventEmitter(), providerOptions);

  // Defer these tests since provider is initialized on next event loop
  setImmediate(() => {
    t.ok(provider.connection);
    provider.connection.emit('ready');
    setImmediate(() => {
      t.ok(provider.connection.exchange.called);
      t.equal(provider.connection.exchange.getCall(0).args[0], providerOptions.exchangeName);
      t.equal(typeof provider.connection.exchange.getCall(0).args[2], 'function');
      t.end();
    });
  });
});

tap.test('Creates a queue using specified name', (t) => {
  const providerOptions = {
    queueName: 'queue',
    exchangeName: 'exchange',
  };
  const provider = createProvider(new EventEmitter(), providerOptions);

  // Defer these tests since provider is initialized on next event loop
  setImmediate(() => {
    provider.connection.emit('ready');
    setImmediate(() => {
      t.equal(provider.connection.queue.getCall(0).args[0], providerOptions.queueName);
      t.equal(typeof provider.connection.queue.getCall(0).args[2], 'function');
      t.end();
    });
  });
});

tap.test('Binds the queue to the exchange', (t) => {
  const providerOptions = {
    queueName: 'queue',
    exchangeName: 'exchange',
  };
  const provider = createProvider(new EventEmitter(), providerOptions);

  // Defer these tests since provider is initialized on next event loop
  setImmediate(() => {
    provider.connection.emit('ready');
    setImmediate(() => {
      t.ok(provider.queue);
      t.equal(provider.queue.bind.getCall(0).args[0], providerOptions.exchangeName);
      t.equal(provider.queue.bind.getCall(0).args[1], '#');
      t.end();
    });
  });
});

tap.test('Sets emmitter to ready', (t) => {
  const providerOptions = {
    queueName: 'queue',
    exchangeName: 'exchange',
  };
  const emitter = new EventEmitter();
  const provider = createProvider(emitter, providerOptions);
  emitFakeReady(provider);

  emitter.once('ready', () => {
    t.equal(emitter.isReady, true);
    t.end();
  });
});

tap.test('Calls publish function with string message', (t) => {
  const providerOptions = {
    queueName: 'queue',
    exchangeName: 'exchange',
  };
  const message = 'test message';
  const emitter = new EventEmitter();
  const provider = createProvider(emitter, providerOptions);

  provider.publish(message);
  emitFakeReady(provider);

  emitter.once('ready', () => {
    setImmediate(() => {
      t.ok(provider.exchange.publish.called);
      t.equal(provider.exchange.publish.getCall(0).args[0], providerOptions.queueName);
      t.equal(provider.exchange.publish.getCall(0).args[1], message);
      t.end();
    });
  });
});

tap.test('Calls publish function with JSON string', (t) => {
  const providerOptions = {
    queueName: 'queue',
    exchangeName: 'exchange',
  };
  const message = { test: 'obj', foo: 'bar' };
  const emitter = new EventEmitter();
  const provider = createProvider(emitter, providerOptions);

  provider.publish(message);
  emitFakeReady(provider);

  emitter.once('ready', () => {
    setImmediate(() => {
      t.ok(provider.exchange.publish.called);
      t.equal(provider.exchange.publish.getCall(0).args[0], providerOptions.queueName);
      t.equal(provider.exchange.publish.getCall(0).args[1], JSON.stringify(message));
      t.end();
    });
  });
});

tap.test('Calls publish function with Buffer', (t) => {
  const providerOptions = {
    queueName: 'queue',
    exchangeName: 'exchange',
  };
  const message = new Buffer([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const emitter = new EventEmitter();
  const provider = createProvider(emitter, providerOptions);

  provider.publish(message);
  emitFakeReady(provider);

  emitter.once('ready', () => {
    setImmediate(() => {
      t.ok(provider.exchange.publish.called);
      t.equal(provider.exchange.publish.getCall(0).args[0], providerOptions.queueName);
      t.equal(provider.exchange.publish.getCall(0).args[1], message.toString('base64'));
      t.end();
    });
  });
});

tap.test('Calls publish function when already... "ready"', (t) => {
  const providerOptions = {
    queueName: 'queue',
    exchangeName: 'exchange',
  };
  const message = 'test message';
  const emitter = new EventEmitter();
  const provider = createProvider(emitter, providerOptions);
  emitFakeReady(provider);

  emitter.once('ready', () => {
    provider.publish(message);
    setImmediate(() => {
      t.ok(provider.exchange.publish.called);
      t.equal(provider.exchange.publish.getCall(0).args[0], providerOptions.queueName);
      t.equal(provider.exchange.publish.getCall(0).args[1], message);
      t.end();
    });
  });
});

tap.test('Subscribes to the queue with a listener', (t) => {
  const providerOptions = {
    queueName: 'queue',
    exchangeName: 'exchange',
  };
  const emitter = new EventEmitter();
  const provider = createProvider(emitter, providerOptions);
  provider.subscribe();
  emitFakeReady(provider);

  emitter.once('ready', () => {
    setImmediate(() => {
      t.ok(provider.queue.subscribe.called);
      t.equal(provider.ctag, fakeConsumerTag);
      t.equal(typeof provider.queue.subscribe.getCall(0).args[0], 'function');
      t.end();
    });
  });
});

tap.test('Emits a string message event after subscribing', (t) => {
  const providerOptions = {
    queueName: 'queue',
    exchangeName: 'exchange',
  };
  const emitter = new EventEmitter();
  const provider = createProvider(emitter, providerOptions);
  provider.subscribe();
  emitFakeReady(provider);

  emitter.once('ready', () => {
    setImmediate(() => {
      const handler = provider.queue.subscribe.getCall(0).args[0];
      const originalMessage = 'test message';
      emitter.on('message', (message) => {
        t.equal(message, originalMessage);
        t.end();
      });

      handler({ data: originalMessage });
    });
  });
});

tap.test('Emits an object message event after subscribing', (t) => {
  const providerOptions = {
    queueName: 'queue',
    exchangeName: 'exchange',
  };
  const emitter = new EventEmitter();
  const provider = createProvider(emitter, providerOptions);
  provider.subscribe();
  emitFakeReady(provider);

  emitter.once('ready', () => {
    setImmediate(() => {
      const handler = provider.queue.subscribe.getCall(0).args[0];
      const originalMessage = { test: 'test', foo: 'bar' };
      emitter.on('message', (message) => {
        t.same(message, originalMessage);
        t.end();
      });

      handler({ data: JSON.stringify(originalMessage) });
    });
  });
});

tap.test('Emits a Buffer message event after subscribing', (t) => {
  const providerOptions = {
    queueName: 'queue',
    exchangeName: 'exchange',
  };
  const emitter = new EventEmitter();
  const provider = createProvider(emitter, providerOptions);
  provider.subscribe();
  emitFakeReady(provider);

  emitter.once('ready', () => {
    setImmediate(() => {
      const handler = provider.queue.subscribe.getCall(0).args[0];
      const originalMessage = new Buffer([1, 2, 3, 4, 5, 6, 7, 8, 9]);
      emitter.on('message', (message) => {
        t.same(message, originalMessage);
        t.end();
      });

      handler({ data: originalMessage.toString('base64') });
    });
  });
});

tap.test('Subcribes to the queue with a listener when already... "ready"', (t) => {
  const providerOptions = {
    queueName: 'queue',
    exchangeName: 'exchange',
  };
  const emitter = new EventEmitter();
  const provider = createProvider(emitter, providerOptions);
  emitFakeReady(provider);

  emitter.once('ready', () => {
    provider.subscribe();
    setImmediate(() => {
      t.ok(provider.queue.subscribe.called);
      t.equal(typeof provider.queue.subscribe.getCall(0).args[0], 'function');
      t.end();
    });
  });
});

tap.test('Unsubscribes from the queue the queue', (t) => {
  const providerOptions = {
    queueName: 'queue',
    exchangeName: 'exchange',
  };
  const emitter = new EventEmitter();
  const provider = createProvider(emitter, providerOptions);
  provider.subscribe();
  emitFakeReady(provider);

  emitter.once('ready', () => {
    setImmediate(() => {
      provider.unsubscribe();
      setImmediate(() => {
        t.ok(provider.queue.unsubscribe.called);
        t.equal(provider.queue.unsubscribe.firstCall.args[0], fakeConsumerTag);
        t.end();
      });
    });
  });
});

tap.test('Unbinds from the queue on close', (t) => {
  const providerOptions = {
    queueName: 'queue',
    exchangeName: 'exchange',
  };
  const emitter = new EventEmitter();
  const provider = createProvider(emitter, providerOptions);
  emitFakeReady(provider);

  emitter.once('ready', () => {
    setImmediate(() => {
      provider.close();
      t.ok(provider.queue.unbind.called);
      t.equal(provider.queue.unbind.firstCall.args[0], provider.exchange);
      t.equal(provider.queue.unbind.firstCall.args[1], '#');
      t.end();
    });
  });
});

tap.test('Destroys the exchange and queue on close', (t) => {
  const providerOptions = {
    queueName: 'queue',
    exchangeName: 'exchange',
  };
  const emitter = new EventEmitter();
  const provider = createProvider(emitter, providerOptions);
  emitFakeReady(provider);

  emitter.once('ready', () => {
    setImmediate(() => {
      provider.close();
      t.ok(provider.queue.destroy.called);
      t.ok(provider.exchange.destroy.called);
      t.end();
    });
  });
});

tap.test('Disconnects the connection on close', (t) => {
  const providerOptions = {
    queueName: 'queue',
    exchangeName: 'exchange',
  };
  const emitter = new EventEmitter();
  const provider = createProvider(emitter, providerOptions);
  emitFakeReady(provider);

  emitter.once('ready', () => {
    setImmediate(() => {
      provider.close();
      t.ok(provider.connection.disconnect.called);
      t.end();
    });
  });
});
