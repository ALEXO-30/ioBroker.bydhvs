"use strict";

/*
 * Created with @iobroker/create-adapter v1.31.0
 */

// battery icon from
// https://freepsdfiles.net/graphics/battery-icon-psd

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core"); // Get common adapter utils
const crc = require("crc");
//const ioBLib = require('strathcole/iob-lib').ioBLib;
const net = require("net");
const IPClient = new net.Socket();


// Load your modules here, e.g.:
// const fs = require("fs");

/**
 * The adapter instance
 * @type {ioBroker.Adapter}
 */
let adapter;
const hvsBatteryVoltsperCell = [];
const hvsBatteryTempperCell = [];
// globale Variablen
/** @type {number | any } */
let myState; // Aktueller Status
let hvsSOC;
let hvsMaxVolt;
let hvsMinVolt;
let hvsMaxmVolt;
let hvsMinmVolt;
let hvsMaxmVoltCell;
let hvsMinmVoltCell;
let hvsA;
let hvsBattVolt;
let hvsMaxTemp;
let hvsMinTemp;
let hvsMaxTempCell;
let hvsMinTempCell;
let hvsBatTemp;
let hvsOutVolt;
let hvsError;
let hvsModules;
let hvsDiffVolt;
let hvsPower;
let hvsBattType;
let hvsInvType;
let hvsNumCells; //number of cells in system
let hvsNumTemps; // number of temperatures to count with
let ConfBatDetailshowoften;
let confBatPollTime;
let myNumberforDetails;
let ConfTestMode;
let FirstRun;


/** @type {string} */
let hvsSerial;
let hvsBMU;
let hvsBMUA;
let hvsBMUB;
let hvsBMS;
let hvsGrid;
let hvsErrorString;
let hvsParamT;

/** @type {boolean} */
let ConfBatDetails;

/*const myStates = [
    "no state",
    "waiting for initial connect",
    "waiting for 1st answer",
    "waiting for 2nd answer"

];*/



/** @type {NodeJS.Timeout} */
let idInterval1;


const myRequests = [
    Buffer.from("010300000066c5e0", "hex"), //0
    Buffer.from("01030500001984cc", "hex"), //1
    Buffer.from("010300100003040e", "hex"), //2
    Buffer.from("0110055000020400018100f853", "hex"), //3
    Buffer.from("010305510001d517", "hex"), //4
    Buffer.from("01030558004104e5", "hex"), //5
    Buffer.from("01030558004104e5", "hex"), //6
    Buffer.from("01030558004104e5", "hex"), //7
    Buffer.from("01030558004104e5", "hex"), //8
];


/* Während des Updates des BMS funktioniert das Auslesen offensichtlich nicht, hier die Antworten des Speichers (Seriennummer verfälscht und CRC des ersten Paketes nicht neu berechnet)
0103cc503030303030303030303030303030303030307878787878030d030f031401000312020101000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000200000015040c12382b82b2
0103320043014a014a0063fff852a80015001400140000030f0000000000000902000252761703000013840000000209020000042c925b
010306031202010100c8ad
0190044dc3 <- Das scheint eine Fehlercondition zu sein.
5 min. später klappte es wieder und dann war auch die neue F/W-Version in der Antwort enthalten
*/
const myErrors = [
    "High Temperature Charging (Cells)",
    "Low Temperature Charging (Cells)",
    "Over Current Discharging",
    "Over Current Charging",
    "Main circuit Failure",
    "Short Current Alarm",
    "Cells Imbalance",
    "Current Sensor Failure",
    "Battery Over Voltage",
    "Battery Under Voltage",
    "Cell Over Voltage",
    "Cell Under Voltage",
    "Voltage Sensor Failure",
    "Temperature Sensor Failure",
    "High Temperature Discharging (Cells)",
    "Low Temperature Discharging (Cells)"
];

const myINVs = [
    "Fronius HV",
    "Goodwe HV",
    "Fronius HV",
    "Kostal HV",
    "Goodwe HV",
    "SMA SBS3.7/5.0",
    "Kostal HV",
    "SMA SBS3.7/5.0",
    "Sungrow HV",
    "Sungrow HV",
    "Kaco HV",
    "Kaco HV",
    "Ingeteam HV",
    "Ingeteam HV",
    "SMA SBS 2.5 HV",
    "",
    "SMA SBS 2.5 HV",
    "Fronius HV"
];

const myBattTypes = [
    "HVL",
    "HVM",
    "HVS"
]
/* HVM: 16 cells per module
   HVS: 32 cells per module
   HVL: unknown so I count 0 cells per module
*/

/**
 * Starts the adapter instance
 * @param {Partial<utils.AdapterOptions>} [options]
 */
function startAdapter(options) {
    // Create the adapter and define its methods
    return adapter = utils.adapter(Object.assign({}, options, {
        name: "bydhvs",

        // The ready callback is called when databases are connected and adapter received configuration.
        // start here!
        ready: main, // Main method defined below for readability

        // is called when adapter shuts down - callback has to be called under any circumstances!
        unload: (callback) => {
            adapter.log.silly("got unload event");
            try {
                clearInterval(idInterval1);
                stopPoll();
                IPClient.destroy();

                callback();
            } catch (e) {
                callback();
            }
        },
    }));
}

/**
 * @param {number} ModuleCount
 */
function setObjectsCells(ModuleCount) {

    const maxCellVolts = ModuleCount * 32 + 1;
    const maxCellTemps = ModuleCount * 12 + 1;

    for (let i = 1; i < maxCellVolts; i++) {
        adapter.setObjectNotExists("CellDetails.CellVolt" + pad(i, 3), {
            type: "state",
            common: {
                name: "Voltage Cell: " + pad(i, 3),
                type: "number",
                role: "",
                read: true,
                write: false,
                unit: "mV"
            },
            native: {}
        });
        checkandrepairUnit("CellDetails.CellVolt" + pad(i, 3), "mV"); //repair forgotten units in first version
    }
    for (let i = 1; i < maxCellTemps; i++) {
        adapter.setObjectNotExists("CellDetails.CellTemp" + pad(i, 3), {
            type: "state",
            common: {
                name: "Temp Cell: " + pad(i, 3),
                type: "number",
                role: "",
                read: true,
                write: false,
                unit: "°C"
            },
            native: {}
        });
        checkandrepairUnit("CellDetails.CellTemp" + pad(i, 3), "°C"); //repair forgotten units in first version

    }
}


function setObjects() {
    const myObjects = [
        ["System.Serial", "state", "Serial number", "string", "", true, false, ""],
        ["System.BMU", "state", "F/W BMU", "string", "", true, false, ""],
        ["System.BMS", "state", "F/W BMS", "string", "", true, false, ""],
        ["System.BMUBankA", "state", "F/W BMU-BankA", "string", "", true, false, ""],
        ["System.BMUBankB", "state", "F/W BMU-BankB", "string", "", true, false, ""],
        ["System.Modules", "state", "modules (count)", "number", "", true, false, ""],
        ["System.Grid", "state", "Parameter Table", "string", "", true, false, ""],
        ["System.ParamT", "state", "F/W BMU", "string", "", true, false, ""],
        ["System.BattType", "state", "Battery Type", "string", "", true, false, ""],
        ["System.InvType", "state", "Inverter Type", "string", "", true, false, ""],
        ["State.SOC", "state", "SOC", "number", "", true, false, "%"],
        ["State.VoltMax", "state", "Max Cell Voltage", "number", "", true, false, "V"],
        ["State.VoltMin", "state", "Min Cell Voltage", "number", "", true, false, "V"],
        ["State.Current", "state", "Charge / Discharge Current", "number", "", true, false, "A"],
        ["State.Power_Consumption", "state", "Discharge Power", "number", "", true, false, "W"],
        ["State.Power_Delivery", "state", "Charge Power", "number", "", true, false, "W"],
        ["State.VoltBatt", "state", "Battery Voltage", "number", "", true, false, "V"],
        ["State.TempMax", "state", "Max Cell Temp", "number", "", true, false, "°C"],
        ["State.TempMin", "state", "Min Cell Temp", "number", "", true, false, "°C"],
        ["State.VoltDiff", "state", "Max - Min Cell Voltage", "number", "", true, false, "V"],
        ["State.Power", "state", "Power", "number", "", true, false, "W"],
        ["State.TempBatt", "state", "Battery Temperature", "number", "", true, false, "°C"],
        ["State.VoltOut", "state", "Output Voltage", "number", "", true, false, "V"],
        ["System.ErrorNum", "state", "Error (numeric)", "number", "", true, false, ""],
        //["State.ErrorNum", "state", "Error (numeric)", "number", "", true, false, ""], // ERROR ERROR ERROR
        ["System.ErrorStr", "state", "Error (string)", "string", "", true, false, ""],
        ["Diagnosis.mVoltMax", "state", "Max Cell Voltage (mv)", "number", "", true, false, "mV"],
        ["Diagnosis.mVoltMin", "state", "Min Cell Voltage (mv)", "number", "", true, false, "mV"],
        ["Diagnosis.mVoltMaxCell", "state", "Max Cell Volt (Cellnr)", "number", "", true, false, ""],
        ["Diagnosis.mVoltMinCell", "state", "Min Cell Volt (Cellnr)", "number", "", true, false, ""],
        ["Diagnosis.TempMaxCell", "state", "Max Cell Temp (Cellnr)", "number", "", true, false, ""],
        ["Diagnosis.TempMinCell", "state", "Min Cell Temp(Cellnr)", "number", "", true, false, ""],
    ];

    for (let i = 0; i < myObjects.length; i++) {
        adapter.setObjectNotExists(myObjects[i][0], {
            type: myObjects[i][1],
            common: {
                name: myObjects[i][2],
                type: myObjects[i][3],
                role: myObjects[i][4],
                read: myObjects[i][5],
                write: myObjects[i][6],
                unit: myObjects[i][7], //works only for new objects, so check later for existing objects
            },
            native: {}
        });
    }
    //repair forgotten units in first version
    for (let i = 0; i < myObjects.length; i++) {
        //console.log("****extend " + i + " " + myObjects[i][0] + " " + myObjects[i][7]);
        if (myObjects[i][7] != "") { //unit is not empty
            checkandrepairUnit(myObjects[i][0], myObjects[i][7]);
        }
    }

    /*    setTimeout(() => {
            adapter.log.error("deleting State State.ErrorNum");
            adapter.deleteState("State.ErrorNum", "", function (err, obj) {
                adapter.log.error("callback deletestate called: " + err + " " + obj);
            });
        }, 4000);*/
    //changeErrorNum(); //not a really good idea but I do not know how to delete -- did not work :-(

}

/*async function changeErrorNum() {
  //did not work, this part created a state with "getObjectAsync"
    try {
        const obj = await adapter.getObjectAsync("State.ErrorNum");
        adapter.extendObject("State.ErrorNum", { common: { type: "string", name: "deprecated" } });
        setTimeout(() => {
            adapter.setState("State.ErrorNum", "moved to System.ErrorNum");
        }, 4000);
    }
    catch (err) {
        //dann eben nicht.
    }
}*/


async function checkandrepairUnit(id, NewUnit) {
    //want to test and understand async and await, so it's introduced here.
    //check for forgotten unit in first version and if it's missing add unit.
    try {
        const obj = await adapter.getObjectAsync(id);
        if (obj.common.unit != NewUnit) {
            adapter.extendObject(id, { common: { unit: NewUnit } });
        }
    }
    catch (err) {
        //dann eben nicht.
    }
}

function checkPacket(data) {
    const byteArray = new Uint8Array(data);
    const packetLength = data[2] + 5;// 3 header, 2 crc
    if (byteArray[0] != 1) { return false; }
    if (byteArray[1] === 3) { //habe die Kodierung der Antwort mit 1 an zweiter Stelle nicht verstanden, daher hier keine Längenprüfung
        if (packetLength != byteArray.length) {
            return (false);
        }
    } else {
        if (byteArray[1] != 16) { return false; }
    }
    return (crc.crc16modbus(byteArray) === 0);
}

function pad(n, width, z) {
    z = z || "0";
    n = n + "";
    return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
}

function buf2int16SI(byteArray, pos) { //signed
    let result = 0;
    result = byteArray[pos] * 256 + byteArray[pos + 1];
    if (result > 32768) {
        result -= 65536;
    }
    return result;
}

function buf2int16US(byteArray, pos) { //unsigned
    let result = 0;
    result = byteArray[pos] * 256 + byteArray[pos + 1];
    return result;
}

function decodePacket1(data) {
    const byteArray = new Uint8Array(data);
    hvsSerial = "";
    for (let i = 3; i < 22; i++) {
        hvsSerial += String.fromCharCode(byteArray[i]);
    }
    hvsBMUA = "V" + byteArray[27].toString() + "." + byteArray[28].toString();
    hvsBMUB = "V" + byteArray[29].toString() + "." + byteArray[30].toString();
    if (byteArray[33] === 0) {
        hvsBMU = hvsBMUA + "-A";
    } else {
        hvsBMU = hvsBMUB + "-B";
    }
    hvsBMS = "V" + byteArray[31].toString() + "." + byteArray[32].toString() + "-" + String.fromCharCode(byteArray[34] + 65);
    hvsModules = parseInt((byteArray[36] - 16).toString());
    if (byteArray[38] === 1) {
        hvsGrid = "OnGrid";
    } else {
        hvsGrid = "OffGrid";
    }
    if (ConfBatDetails && FirstRun) {
        FirstRun = false;
        console.log("decodePacket1 + firstrun " + FirstRun + " modules " + hvsModules);
        setObjectsCells(hvsModules);
    }
    /*    if ((ConfBatDetails) && (hvsModules > 2)) {
            adapter.log.error("Sorry, Details at the moment only for two modules. I need a wireshark dump from bigger systems to adjust the adapter.");
            ConfBatDetails = false;
        }*/
}

function decodePacket2(data) {
    const byteArray = new Uint8Array(data);
    hvsSOC = buf2int16SI(byteArray, 3);
    hvsMaxVolt = parseFloat((buf2int16SI(byteArray, 5) * 1.0 / 100.0).toFixed(2));
    hvsMinVolt = parseFloat((buf2int16SI(byteArray, 7) * 1.0 / 100.0).toFixed(2));
    hvsA = parseFloat((buf2int16SI(byteArray, 11) * 1.0 / 10.0).toFixed(1));
    hvsBattVolt = parseFloat((buf2int16US(byteArray, 13) * 1.0 / 100.0).toFixed(1));
    hvsMaxTemp = buf2int16SI(byteArray, 15);
    hvsMinTemp = buf2int16SI(byteArray, 17);
    hvsBatTemp = buf2int16SI(byteArray, 19);
    hvsError = buf2int16SI(byteArray, 29);
    hvsParamT = byteArray[31].toString() + "." + byteArray[32].toString();
    hvsOutVolt = parseFloat((buf2int16US(byteArray, 35) * 1.0 / 100.0).toFixed(1));
    hvsPower = hvsA * hvsOutVolt;
    hvsDiffVolt = Math.round((hvsMaxVolt - hvsMinVolt) * 100) / 100;
    hvsErrorString = "";
    //        hvsError = 65535;
    for (let j = 0; j < 16; j++) {
        if (((1 << j) & hvsError) !== 0) {
            if (hvsErrorString.length > 0) {
                hvsErrorString += "; ";
            }
            hvsErrorString += myErrors[j];
        }
    }
    if (hvsErrorString.length === 0) { hvsErrorString = "no Error"; }
}

function decodePacketNOP(data) {
    adapter.log.silly("Packet NOP");
}

function decodePacket3(data) {
    const byteArray = new Uint8Array(data);
    hvsBattType = byteArray[5];
    hvsInvType = byteArray[3];
    hvsNumCells = 0;
    hvsNumTemps = 0;
    switch (hvsBattType) {
        case 0: //HVL -> unknown specification, so 0 cells and 0 temps
            //hvsNumCells = 0;
            //hvsNumTemps = 0;
            //see above, is default
            break;
        case 1: //HVM 16 Cells per module
            hvsNumCells = hvsModules * 16;
            hvsNumTemps = hvsModules * 8;
            break;
        //crosscheck
        // 5 modules, 80 voltages, 40 temps
        case 2: //HVS 32 cells per module
            hvsNumCells = hvsModules * 32;
            hvsNumTemps = hvsModules * 12;
            break;
        //crosscheck:
        //Counts from real data: 
        //mine: 2 modules, 64 voltages, 24 temps
        //4 modules, 128 voltages, 48 temps
    }
    if (hvsNumCells > 128) { hvsNumCells = 128 }
    if (hvsNumTemps > 60) { hvsNumTemps = 60 }
}


function decodePacket6(data) {
    const byteArray = new Uint8Array(data);
    hvsMaxmVolt = buf2int16SI(byteArray, 5);
    hvsMinmVolt = buf2int16SI(byteArray, 7);
    hvsMaxmVoltCell = byteArray[9];
    hvsMinmVoltCell = byteArray[10];
    hvsMaxTempCell = byteArray[15];
    hvsMinTempCell = byteArray[16];

    //starting with byte 101, ending with 131, Cell voltage 1-16 
    let MaxCells = 16
    for (let i = 0; i < MaxCells; i++) {
        adapter.log.silly("Battery Voltage-" + pad((i + 1), 3) + " :" + buf2int16SI(byteArray, i * 2 + 101));
        hvsBatteryVoltsperCell[i + 1] = buf2int16SI(byteArray, i * 2 + 101);
    }
}

function decodePacket7(data) {
    const byteArray = new Uint8Array(data);
    // e.g. hvsNumCells = 80
    // first Voltage in byte 5+6
    // Count = 80-17 --> 63
    let MaxCells = hvsNumCells - 17; //0 to n-1 is the same like 1 to n
    if (MaxCells > 64) { MaxCells = 64 }
    for (let i = 0; i < MaxCells; i++) {
        adapter.log.silly("Battery Voltage-" + pad((i + 17), 3) + " :" + buf2int16SI(byteArray, i * 2 + 5));
        hvsBatteryVoltsperCell[i + 17] = buf2int16SI(byteArray, i * 2 + 5);
    }
}

function decodePacket8(data) {
    const byteArray = new Uint8Array(data);
    let MaxCounterV = 0;
    let MaxCounterT = 0;
    //starting with byte 5, ending 101, voltage for cell 81 to 128
    //starting with byte 103, ending 132, temp for cell 1 to 30

    // e.g. hvsNumCells = 128
    // first Voltage in byte 5+6
    // Count = 128-80 --> 48
    let MaxCells = hvsNumCells - 80; //0 to n-1 is the same like 1 to n
    if (MaxCells > 48) { MaxCells = 48 }
    adapter.log.silly("hvsModules =" + hvsModules + " maxCells= " + MaxCells);
    for (let i = 0; i < MaxCells; i++) {
        adapter.log.silly("Battery Voltage-" + pad((i + 81), 3) + " :" + buf2int16SI(byteArray, i * 2 + 5));
        hvsBatteryVoltsperCell[i + 81] = buf2int16SI(byteArray, i * 2 + 5);
    }

    let MaxTemps = hvsNumTemps - 0; //0 to n-1 is the same like 1 to n
    if (MaxTemps > 30) { MaxTemps = 30 }
    adapter.log.silly("hvsModules =" + hvsModules + " MaxTemps= " + MaxTemps);
    for (let i = 0; i < MaxTemps; i++) {
        adapter.log.silly("Battery Temp " + pad(i + 1, 3) + " :" + byteArray[i + 103]);
        hvsBatteryTempperCell[i + 1] = byteArray[i + 103];
    }
}

function decodePacket9(data) {
    const byteArray = new Uint8Array(data);
    let MaxTemps = hvsNumTemps - 30; //0 to n-1 is the same like 1 to n
    if (MaxTemps > 30) { MaxTemps = 30 }
    adapter.log.silly("hvsModules =" + hvsModules + " MaxTemps= " + MaxTemps);
    for (let i = 0; i < MaxTemps; i++) {
        adapter.log.silly("Battery Temp " + pad(i + 31, 3) + " :" + byteArray[i + 5]);
        hvsBatteryTempperCell[i + 31] = byteArray[i + 5];
    }
}

function setConnected(adapter, isConnected) {
    if (adapter._connected !== isConnected) {
        adapter._connected = isConnected;
        adapter.setState("info.connection", adapter._connected, true, err =>
            // analyse if the state could be set (because of permissions)
            err ? adapter.log.error("Can not update adapter._connected state: " + err) :
                adapter.log.debug("connected set to " + adapter._connected));
    }
}


function setStates() {

    adapter.log.silly("hvsSerial       >" + hvsSerial + "<");
    adapter.log.silly("hvsBMU          >" + hvsBMU + "<");
    adapter.log.silly("hvsBMUA         >" + hvsBMUA + "<");
    adapter.log.silly("hvsBMUB         >" + hvsBMUB + "<");
    adapter.log.silly("hvsBMS          >" + hvsBMS + "<");
    adapter.log.silly("hvsModules      >" + hvsModules + "<");
    adapter.log.silly("hvsGrid         >" + hvsGrid + "<");
    adapter.log.silly("hvsSOC          >" + hvsSOC + "<");
    adapter.log.silly("hvsMaxVolt      >" + hvsMaxVolt + "<");
    adapter.log.silly("hvsMinVolt      >" + hvsMinVolt + "<");
    adapter.log.silly("hvsA            >" + hvsA + "<");
    adapter.log.silly("hvsBattVolt     >" + hvsBattVolt + "<");
    adapter.log.silly("hvsMaxTemp      >" + hvsMaxTemp + "<");
    adapter.log.silly("hvsMinTemp      >" + hvsMinTemp + "<");
    adapter.log.silly("hvsDiffVolt     >" + hvsDiffVolt + "<");
    adapter.log.silly("hvsPower        >" + hvsPower + "<");
    adapter.log.silly("hvsParamT       >" + hvsParamT + "<");
    adapter.log.silly("hvsBatTemp      >" + hvsBatTemp + "<");
    adapter.log.silly("hvsOutVolt      >" + hvsOutVolt + "<");
    adapter.log.silly("hvsError        >" + hvsError + "<");
    adapter.log.silly("hvsErrorStr     >" + hvsErrorString + "<");

    adapter.setState("System.Serial", hvsSerial, true);
    adapter.setState("System.BMU", hvsBMU, true);
    adapter.setState("System.BMUBankA", hvsBMUA, true);
    adapter.setState("System.BMUBankB", hvsBMUB, true);
    adapter.setState("System.BMS", hvsBMS, true);
    adapter.setState("System.Modules", hvsModules, true);
    adapter.setState("System.Grid", hvsGrid, true);
    adapter.setState("State.SOC", hvsSOC, true);
    adapter.setState("State.VoltMax", hvsMaxVolt, true);
    adapter.setState("State.VoltMin", hvsMinVolt, true);
    adapter.setState("State.Current", hvsA, true);
    adapter.setState("State.VoltBatt", hvsBattVolt, true);
    adapter.setState("State.TempMax", hvsMaxTemp, true);
    adapter.setState("State.TempMin", hvsMinTemp, true);
    adapter.setState("State.VoltDiff", hvsDiffVolt, true);
    adapter.setState("State.Power", hvsPower, true /*ack*/);
    adapter.setState("System.ParamT", hvsParamT, true);
    adapter.setState("State.TempBatt", hvsBatTemp, true);
    adapter.setState("State.VoltOut", hvsOutVolt, true);
    adapter.setState("System.ErrorNum", hvsError, true);
    adapter.setState("System.ErrorStr", hvsErrorString, true);
    if (hvsPower >= 0) {
        adapter.setState("State.Power_Consumption", hvsPower, true);
        adapter.setState("State.Power_Delivery", 0, true);
    } else {
        adapter.setState("State.Power_Consumption", 0, true);
        adapter.setState("State.Power_Delivery", -hvsPower, true);
    }
    adapter.setState("System.BattType", myBattTypes[hvsBattType], true);
    adapter.setState("System.InvType", myINVs[hvsInvType], true);

    if (myNumberforDetails == 0) {
        const maxCellVolts = hvsModules * 32 + 1;
        const maxCellTemps = hvsModules * 12 + 1;
        adapter.setState("Diagnosis.mVoltMax", hvsMaxmVolt, true);
        adapter.setState("Diagnosis.mVoltMin", hvsMinmVolt, true);
        adapter.setState("Diagnosis.mVoltMaxCell", hvsMaxmVoltCell, true);
        adapter.setState("Diagnosis.mVoltMinCell", hvsMinmVoltCell, true);
        adapter.setState("Diagnosis.TempMaxCell", hvsMaxTempCell, true);
        adapter.setState("Diagnosis.TempMinCell", hvsMinTempCell, true);

        for (let i = 1; i < maxCellVolts; i++) {
            adapter.setState("CellDetails.CellVolt" + pad(i, 3), hvsBatteryVoltsperCell[i], true);
        }
        for (let i = 1; i < maxCellTemps; i++) {
            adapter.setState("CellDetails.CellTemp" + pad(i, 3), hvsBatteryTempperCell[i], true);
        }
        adapter.log.silly("hvsMaxmVolt     >" + hvsMaxmVolt + "<");
        adapter.log.silly("hvsMinmVolt     >" + hvsMinmVolt + "<");
        adapter.log.silly("hvsMaxmVoltCell >" + hvsMaxmVoltCell + "<");
        adapter.log.silly("hvsMinmVoltCell >" + hvsMinmVoltCell + "<");
        adapter.log.silly("hvsMaxTempCell  >" + hvsMaxTempCell + "<");
        adapter.log.silly("hvsMinTempCell  >" + hvsMinTempCell + "<");
    }

}

function startPoll(adapter) {
    //erster Start sofort (500ms), dann entsprechend der Config - dann muss man nicht beim Entwickeln warten bis der erste Timer durch ist.
    FirstRun = true;
    setTimeout(() => { Poll(adapter); }, 500);
    idInterval1 = setInterval(() => Poll(adapter), confBatPollTime * 1000);
    adapter.log.info("gestartet: " + adapter.config.ConfPollInterval + " " + idInterval1);
}

function stopPoll() {
    idInterval1 && clearInterval(idInterval1);
}

IPClient.on("data", function (data) {
    adapter.log.silly("Received, State: " + myState + " Data: " + data.toString("hex"));
    if (ConfTestMode) {
        let PacketNumber = myState - 1;
        adapter.log.error("Received, Packet: " + PacketNumber + " Data: " + data.toString("hex"));
    }
    if (checkPacket(data) == false) {
        adapter.log.error("error: no valid data");
        IPClient.destroy();
        setConnected(adapter, false);
        myState = 0;
    }
    setConnected(adapter, true);
    switch (myState) {
        case 2:
            decodePacket1(data);
            IPClient.setTimeout(1000);
            setTimeout(() => {
                myState = 3;
                IPClient.write(myRequests[1]);
            }, 200);
            break;
        case 3:
            decodePacket2(data);
            IPClient.setTimeout(1000);
            setTimeout(() => {
                myState = 4;
                IPClient.write(myRequests[2]);
            }, 200);
            break;
        case 4: //test if it is time for reading all data. If not stop here
            decodePacket3(data);
            if ((myNumberforDetails < ConfBatDetailshowoften) || (ConfBatDetails == false)) {
                setStates();
                IPClient.destroy();
                myState = 0;
            } else {
                myNumberforDetails = 0; //restart counting
                IPClient.setTimeout(1000);
                setTimeout(() => {
                    myState = 5;
                    IPClient.write(myRequests[3]);
                }, 200);
            }
            break;
        case 5:
            decodePacketNOP(data);
            IPClient.setTimeout(8000);
            myState = 6;
            adapter.log.silly("waiting 4 seconds to measure cells");
            setTimeout(() => {
                IPClient.write(myRequests[4]);
            }, 4000);
            break;
        case 6:
            decodePacketNOP(data);
            IPClient.setTimeout(1000);
            myState = 7;
            setTimeout(() => {
                IPClient.write(myRequests[5]);
            }, 200);
            break;
        case 7:
            decodePacket6(data);
            IPClient.setTimeout(1000);
            setTimeout(() => {
                myState = 8;
                IPClient.write(myRequests[6]);
            }, 200);
            break;
        case 8:
            decodePacket7(data);
            IPClient.setTimeout(1000);
            setTimeout(() => {
                myState = 9;
                IPClient.write(myRequests[7]);
            }, 200);
            break;
        case 9:
            decodePacket8(data);
            IPClient.setTimeout(1000);
            setTimeout(() => {
                myState = 10;
                IPClient.write(myRequests[8]);
            }, 200);
            break;
        case 10:
            decodePacket9(data);
            setStates();
            IPClient.destroy();
            myState = 0;
            break;
        default:
            IPClient.destroy();
    }
});


IPClient.on("timeout", function () {
    IPClient.destroy();
    setConnected(adapter, false);
    myState = 0;
    adapter.log.error("no connection to IP: " + adapter.config.ConfIPAdress);
});

function Poll(adapter) {
    myState = 1;
    IPClient.setTimeout(1000);
    myNumberforDetails += 1;
    adapter.log.silly("myNumberforDetails:" + myNumberforDetails);
    adapter.log.silly("Poll start, IP:" + adapter.config.ConfIPAdress);
    IPClient.connect(8080, adapter.config.ConfIPAdress, function () {
        myState = 2;
        setConnected(adapter, true);
        IPClient.write(myRequests[0]);
    });
}

async function main() {

    // Reset the connection indicator during startup
    //    await this.setStateAsync("info.connection", false, true);
    setConnected(adapter, false);
    setObjects();
    myState = 0;

    // The adapters config (in the instance object everything under the attribute "native") is accessible via
    // adapter.config:
    adapter.log.info("Poll Interval: " + adapter.config.ConfPollInterval);
    confBatPollTime = parseInt(adapter.config.ConfPollInterval);
    if (confBatPollTime < 60) {
        confBatPollTime = 60;
        adapter.log.error("polling to often - max once per minute ");
    }
    adapter.log.info("BYD IP Adress: " + adapter.config.ConfIPAdress);
    ConfBatDetails = (adapter.config.ConfBatDetails ? true : false);
    adapter.log.info("Bat Details  : " + adapter.config.ConfBatDetails);
    ConfBatDetailshowoften = parseInt(adapter.config.ConfDetailshowoften);
    if (ConfBatDetailshowoften < 10) {
        ConfBatDetails = false;
        adapter.log.error("Details polling to often - disabling ");
    }
    ConfTestMode = (adapter.config.ConfTestMode ? true : false);
    adapter.log.info("BatDetailshowoften: " + ConfBatDetailshowoften);
    adapter.log.silly("TestMode= " + ConfTestMode);
    myNumberforDetails = ConfBatDetailshowoften;
    //    adapter.config.ConfPollInterval = parseInt(adapter.config.ConfPollInterval, 10) || 60;

    adapter.log.info("starte poll");
    startPoll(adapter);

    // examples for the checkPassword/checkGroup functions
    /*    adapter.checkPassword("admin", "iobroker", (res) => {
            adapter.log.info("check user admin pw iobroker: " + res);
        });
        adapter.checkGroup("admin", "admin", (res) => {
            adapter.log.info("check group user admin group admin: " + res);
        });*/
}

// @ts-ignore parent is a valid property on module
if (module.parent) {
    // Export startAdapter in compact mode
    module.exports = startAdapter;
} else {
    // otherwise start the instance directly
    startAdapter();
}
