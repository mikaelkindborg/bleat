/* @license
 *
 * BLE Abstraction Tool: noble adapter
 * Version: 0.0.4
 *
 * The MIT License (MIT)
 *
 * Copyright (c) 2015 Rob Moran
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

// https://github.com/umdjs/umd
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        // AMD. Register as an anonymous module.
        define(['noble', 'bleat.core'], factory);
    } else if (typeof exports === 'object') {
        // Node. Does not work with strict CommonJS
        module.exports = factory(require('noble'), require('./bleat.core'));
    } else {
        // Browser globals with support for web workers (root is window)
        factory(root.noble, root.bleat);
    }
}(this, function(noble, bleat) {
    "use strict";

    function checkForError(errorFn, continueFn) {
        return function(error) {
            if (error) errorFn(error);
            else if (typeof continueFn === "function") {
                var args = [].slice.call(arguments, 1);
                continueFn.apply(this, args);
            }
        };
    }

    // https://github.com/sandeepmistry/noble
    if (noble) {
        bleat._addAdapter("noble", {
            deviceHandles: {},
            serviceHandles: {},
            characteristicHandles: {},
            descriptorHandles: {},
            charNotifies: {},
            foundFn: null,
            init: function() {
                noble.on('discover', function(deviceInfo) {
                    if (this.foundFn) {
                        var deviceID = (deviceInfo.address && deviceInfo.address !== "unknown") ? deviceInfo.address : deviceInfo.id;
                        if (!this.deviceHandles[deviceID]) this.deviceHandles[deviceID] = deviceInfo;

                        var serviceUUIDs = [];
                        if (deviceInfo.advertisement.serviceUuids) {
                            deviceInfo.advertisement.serviceUuids.forEach(function(serviceUUID) {
                                serviceUUIDs.push(bleat._canonicalUUID(serviceUUID));
                            });
                        }

                        var manufacturerData = {};
                        if (deviceInfo.advertisement.manufacturerData) {
                            // First 2 bytes are 16-bit company identifier
                            var company = deviceInfo.advertisement.manufacturerData.readUInt16LE(0);
                            company = ("0000" + company.toString(16)).slice(-4);
                            // Buffer to ArrayBuffer
                            var data = new Uint8Array(deviceInfo.advertisement.manufacturerData).buffer.slice(2);
                            manufacturerData[company] = data;
                        }

                        var serviceData = {};
                        if (deviceInfo.advertisement.serviceData) {
                            deviceInfo.advertisement.serviceData.forEach(function(serviceAdvert) {
                                // Buffer to ArrayBuffer
                                serviceData[serviceAdvert.uuid] = new Uint8Array(serviceAdvert.data).buffer;
                            });
                        }

                        this.foundFn({
                            _handle: deviceID,
                            id: deviceID,
                            name: deviceInfo.advertisement.localName,
                            uuids: serviceUUIDs,
                            adData: {
                                manufacturerData: manufacturerData,
                                serviceData: serviceData,
                                txPower: deviceInfo.advertisement.txPowerLevel,
                                rssi: deviceInfo.rssi
                            }
                        });
                    }
                }.bind(this));
            },
            startScan: function(serviceUUIDs, completeFn, foundFn, errorFn) {
                this.deviceHandles = {};
                var stateCB = function(state) {
                    if (state === "poweredOn") {
                        if (serviceUUIDs.length === 0) this.foundFn = foundFn;
                        else this.foundFn = function(device) {
                            serviceUUIDs.forEach(function(serviceUUID) {
                                if (device.uuids.indexOf(serviceUUID) >= 0) {
                                    foundFn(device);
                                    return;
                                }
                            });
                        };
                        noble.startScanning([], false, checkForError(errorFn, completeFn));
                    }
                    else errorFn("adapter not enabled");
                }.bind(this);
                if (noble.state === "unknown") noble.once('stateChange', stateCB.bind(this));
                else stateCB(noble.state);
            },
            stopScan: function(errorFn) {
                this.foundFn = null;
                noble.stopScanning();
            },
            connect: function(handle, connectFn, disconnectFn, errorFn) {
                var baseDevice = this.deviceHandles[handle];
                baseDevice.once("connect", connectFn);
                baseDevice.once("disconnect", function() {
                    this.serviceHandles = {};
                    this.characteristicHandles = {};
                    this.descriptorHandles = {};
                    this.charNotifies = {};
                    disconnectFn();
                }.bind(this));
                baseDevice.connect(checkForError(errorFn));
            },
            disconnect: function(handle, errorFn) {
                this.deviceHandles[handle].disconnect(checkForError(errorFn));
            },
            discoverServices: function(handle, serviceUUIDs, completeFn, errorFn) {
                var baseDevice = this.deviceHandles[handle];
                baseDevice.discoverServices([], checkForError(errorFn, function(services) {

                    var discovered = [];
                    services.forEach(function(serviceInfo) {
                        var serviceUUID = bleat._canonicalUUID(serviceInfo.uuid);

                        if (serviceUUIDs.length === 0 || serviceUUIDs.indexOf(serviceUUID) >= 0) {
                            if (!this.serviceHandles[serviceUUID]) this.serviceHandles[serviceUUID] = serviceInfo;

                            discovered.push({
                                _handle: serviceUUID,
                                uuid: serviceUUID,
                                primary: true
                            });
                        }
                    }, this);

                    completeFn(discovered);
                }.bind(this)));
            },
            discoverIncludedServices: function(handle, serviceUUIDs, completeFn, errorFn) {
                var serviceInfo = this.serviceHandles[handle];
                serviceInfo.discoverIncludedServices([], checkForError(errorFn, function(services) {

                    var discovered = [];
                    services.forEach(function(serviceInfo) {
                        var serviceUUID = bleat._canonicalUUID(serviceInfo.uuid);

                        if (serviceUUIDs.length === 0 || serviceUUIDs.indexOf(serviceUUID) >= 0) {
                            if (!this.serviceHandles[serviceUUID]) this.serviceHandles[serviceUUID] = serviceInfo;

                            discovered.push({
                                _handle: serviceUUID,
                                uuid: serviceUUID,
                                primary: false
                            });
                        }
                    }, this);

                    completeFn(discovered);
                }.bind(this)));
            },
            discoverCharacteristics: function(handle, characteristicUUIDs, completeFn, errorFn) {
                var serviceInfo = this.serviceHandles[handle];
                serviceInfo.discoverCharacteristics([], checkForError(errorFn, function(characteristics) {

                    var discovered = [];
                    characteristics.forEach(function(characteristicInfo) {
                        var charUUID = bleat._canonicalUUID(characteristicInfo.uuid);

                        if (characteristicUUIDs.length === 0 || characteristicUUIDs.indexOf(charUUID) >= 0) {
                            if (!this.characteristicHandles[charUUID]) this.characteristicHandles[charUUID] = characteristicInfo;

                            discovered.push({
                                _handle: charUUID,
                                uuid: charUUID,
                                properties: {
                                    broadcast:                  (characteristicInfo.properties.indexOf("broadcast") >= 0),
                                    read:                       (characteristicInfo.properties.indexOf("read") >= 0),
                                    writeWithoutResponse:       (characteristicInfo.properties.indexOf("writeWithoutResponse") >= 0),
                                    write:                      (characteristicInfo.properties.indexOf("write") >= 0),
                                    notify:                     (characteristicInfo.properties.indexOf("notify") >= 0),
                                    indicate:                   (characteristicInfo.properties.indexOf("indicate") >= 0),
                                    authenticatedSignedWrites:  (characteristicInfo.properties.indexOf("authenticatedSignedWrites") >= 0),
                                    reliableWrite:              (characteristicInfo.properties.indexOf("reliableWrite") >= 0),
                                    writableAuxiliaries:        (characteristicInfo.properties.indexOf("writableAuxiliaries") >= 0)
                                }
                            });

                            characteristicInfo.on('data', function(data, isNotification) {
                                if (isNotification === true && typeof this.charNotifies[charUUID] === "function") {
                                    var arrayBuffer = new Uint8Array(data).buffer;
                                    this.charNotifies[charUUID](arrayBuffer);
                                }
                            }.bind(this));
                        }
                    }, this);

                    completeFn(discovered);
                }.bind(this)));
            },
            discoverDescriptors: function(handle, descriptorUUIDs, completeFn, errorFn) {
                var characteristicInfo = this.characteristicHandles[handle];
                characteristicInfo.discoverDescriptors(checkForError(errorFn, function(descriptors) {

                    var discovered = [];
                    descriptors.forEach(function(descriptorInfo) {
                        var descUUID = bleat._canonicalUUID(descriptorInfo.uuid);

                        if (descriptorUUIDs.length === 0 || descriptorUUIDs.indexOf(descUUID) >= 0) {
                            var descHandle = characteristicInfo.uuid + "-" + descriptorInfo.uuid;
                            if (!this.descriptorHandles[descHandle]) this.descriptorHandles[descHandle] = descriptorInfo;

                            discovered.push({
                                _handle: descHandle,
                                uuid: descUUID
                            });
                        }
                    }, this);

                    completeFn(discovered);
                }.bind(this)));
            },
            readCharacteristic: function(handle, completeFn, errorFn) {
                this.characteristicHandles[handle].read(checkForError(errorFn, function(data) {
                    var arrayBuffer = new Uint8Array(data).buffer;
                    completeFn(arrayBuffer);
                }));
            },
            writeCharacteristic: function(handle, arrayBuffer, completeFn, errorFn) {
                var buffer = new Buffer(new Uint8Array(arrayBuffer));
                this.characteristicHandles[handle].write(buffer, true, checkForError(errorFn, completeFn));
            },
            enableNotify: function(handle, notifyFn, completeFn, errorFn) {
                this.characteristicHandles[handle].once("notify", function(state) {
                    if (state !== true) return errorFn("notify failed to enable");
                    this.charNotifies[handle] = notifyFn;
                    completeFn();
                }.bind(this));
                this.characteristicHandles[handle].notify(true, checkForError(errorFn));
            },
            disableNotify: function(handle, completeFn, errorFn) {
                this.characteristicHandles[handle].once("notify", function(state) {
                    if (state !== false) return errorFn("notify failed to disable");
                    if (this.charNotifies[handle]) delete this.charNotifies[handle];
                    completeFn();
                }.bind(this));
                this.characteristicHandles[handle].notify(false, checkForError(errorFn));
            },
            readDescriptor: function(handle, completeFn, errorFn) {
                this.descriptorHandles[handle].readValue(checkForError(errorFn, function(data) {
                    var arrayBuffer = new Uint8Array(data).buffer;
                    completeFn(arrayBuffer);                    
                }));
            },
            writeDescriptor: function(handle, arrayBuffer, completeFn, errorFn) {
                var buffer = new Buffer(new Uint8Array(arrayBuffer));
                this.descriptorHandles[handle].writeValue(buffer, checkForError(errorFn, completeFn));
            }
        });
    }
}));