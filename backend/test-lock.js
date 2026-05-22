// test-lock.js
const axios = require("axios");

const URL = "http://localhost:3000/api/compare/process";
const BODY = {
  // mac_address: "80:DE:CC:00:00:00",
  // generated_name: "test-generator",

  line: "line",
  mac_address: "80:DE:CC:00:00:00",
  generator_name: "generator_name",
  serial: "1",
  lightstick: "lightstick",
  artist: "artist",
  fw_version: "fw_version",
  device_name: "device_name",
};

async function sendRequest(index) {
  try {
    const response = await axios.post(URL, BODY);
    console.log(`[${index}] ✅ SUCCESS:`, response.data);
  } catch (err) {
    if (err.response) {
      console.log(
        `[${index}] ❌ ERROR ${err.response.status}:`,
        err.response.data
      );
    } else {
      console.log(`[${index}] ❌ ERROR:`, err.message);
    }
  }
}

async function runParallelTest() {
  const count = 5; // 동시에 5개 요청
  const promises = [];
  for (let i = 0; i < count; i++) {
    promises.push(sendRequest(i + 1));
  }
  await Promise.all(promises);
}

runParallelTest();
