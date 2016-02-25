var bluetooth = require('./index');
var gattServer;
var accelerometer;

function log(message) {
	console.log(message);
}

/*
// Only in SensorTag CC2541.
instance.ACCELEROMETER = {
    SERVICE: 'f000aa10-0451-4000-b000-000000000000',
    DATA: 'f000aa11-0451-4000-b000-000000000000',
    CONFIG: 'f000aa12-0451-4000-b000-000000000000',
    PERIOD: 'f000aa13-0451-4000-b000-000000000000',
}
*/

log('Requesting Bluetooth Devices...');
bluetooth.requestDevice({
	//filters:[{ services:[ '0xf000aa10' ] }]
	filters:[]
})
.then(device => {
	log('Found device: ' + device.name);
	log(device);
	//return device.connectGATT();
	return device.gatt.connect();
})
.then(server => {
	gattServer = server;
	log('Gatt server connected: ' + gattServer.connected);
	return gattServer.getPrimaryService('f000aa10-0451-4000-b000-000000000000');
})
.then(service => {
	log('Primary service: ' + service.uuid);
	return service.getCharacteristic('f000aa11-0451-4000-b000-000000000000');
})
.then(characteristic => {
	log('Characteristic: ' + characteristic.uuid);
	accelerometer = characteristic;
	return accelerometer.getDescriptors();
})
.then(descriptors => {
	descriptors.forEach(descriptor => {
		log('Descriptor: ' + descriptor.uuid);
	});

	return Array.apply(null, Array(10)).reduce(sequence => {
		return sequence.then(() => {
			return accelerometer.readValue();
		}).then(value => {
		    log('typeof value: ' + typeof value)
		    log(JSON.stringify(value))
		    log(value)
			//var view = new DataView(value);
			//log('Value: ' + view.getUint16(0));
		});
	}, Promise.resolve());
})
.then(() => {
	gattServer.disconnect();
	log('Gatt server connected: ' + gattServer.connected);
	process.exit();
})
.catch(error => {
	log(error);
	process.exit();
});
