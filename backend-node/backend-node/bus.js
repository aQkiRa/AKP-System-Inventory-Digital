const bus = { io: null };

function emit(event, payload) {
  if (bus.io) bus.io.emit(event, payload);
}

module.exports = { bus, emit };
