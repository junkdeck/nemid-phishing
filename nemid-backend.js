const http = require('http');
const static = require('node-static');
const uuidv4 = require('uuid/v4')
const jsonBody = require('body/json')
const sendJson = require('send-data/json')
const puppeteer = require('puppeteer');
const js = require('fs');

const hostname = '0.0.0.0';
const port = 8080;

const file = new static.Server('./build');
let browsers = {};

const applyAsync = (acc,val) => acc.then(val);
const composeAsync = (...funcs) => x => funcs.reduce(applyAsync, Promise.resolve(x));

class Browser {
  scraped = {};
  otpRequestCode = null;
  waitingForAppAck = false;
  page = null;

  constructor(id) {
    this.id = id;
  }

  static create(id) {
    let browser = new Browser(id);
    newPuppeteer().then((page) => {
      browser.page = page;
    });
    return browser;
  }

  async function newPuppeteer() {
    const puppet = await puppeteer.launch({
      slowMo: 250, // slow down by 250ms
      timeout: 60000,
      //headless: false,
    });
    const page = await puppet.newPage();
    page.setDefaultTimeout(60000);
    if (process.env.DEBUG) {
      page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    }
    if (process.env.TRACE) {
      await page.tracing.start({ path: 'trace.json', screenshots: true });
    }
    return page;
  }
}

async function login(browser, username, password) {
  console.log("goto login");
  await page.goto('https://post.borger.dk');
  console.log("wait for nemid frame");
  await page.waitForSelector('iframe#nemid_iframe');
  const frame = page.frames().find(frame => frame.name() === 'nemid_iframe');
  await frame.waitForSelector('.userid-pwd input:focus', { visible: true });
  await page.keyboard.type(username);
  await page.keyboard.press('Tab');
  await page.keyboard.type(password);
  await page.screenshot({ path: `${id}/nemlogin_step_1.png` });
  console.log("Send login");
  await page.keyboard.press('Enter');
}

async function otpRequest(page) {
  console.log("wait for nemid frame");
  await page.waitForSelector('iframe#nemid_iframe');
  const frame = page.frames().find(frame => frame.name() === 'nemid_iframe');
  await frame.waitForSelector('button', { visible: true });
  otp = await frame.$('input.otp-input:focus', { visible: true });
  if (!otp) {
    console.log("Switch from app to otp card mode.");
    await frame.click('a.link')
    otp = await frame.waitForSelector('input.otp-input:focus', { visible: true });
  }
  otp_query = await otp.evaluate((node) => node.parentNode.previousSibling.innerText);
  console.log("ask for " + otp_query);
  return otp_query;
}

async function submitOTP(browser, code) {
  let { id, page } = browser;
  console.log("type otp: " + code);
  await page.keyboard.type(code);
  console.log("send otp");
  await page.screenshot({ path: `${id}/nemlogin_step_2.png` });
  await page.keyboard.press('Enter');
  return browser;
}

async function postBorgerDk(browser) {
  let { id, page } = browser;
  await page.goto('https://post.borger.dk');
  let latestSender = await page.waitForSelector('.mailSender');
  await page.screenshot({ path: `${id}/post_borger_dk_latest_sender.png` });
  browser.scraped.post_borger_dk_latest_sender = latestSender;
  return browser;
}

async function sundhedDk(browser) {
  let { id, page } = browser;
  await page.goto('https://www.sundhed.dk/login/unsecure/logon.ashx?ReturnUrl=$min_side');
  let doctor = await page.waitForSelector('.ng-binding[ng-bind="apptheme.data.Name"]');
  await page.screenshot({ path: `${id}/sundhed_dk_doctor.png` });
  browser.scraped.sundhed_dk_doctor = doctor;
  return browser;
}

async function fmk-onlineDk(browser) {
  let { id, page } = browser;
  await page.goto('https://fmk-online.dk/fmk/');
  let nameCpr = await page.waitForSelector('#user-name');
  await page.screenshot({ path: `${id}/fmk_online_dk_name_cpr.png` });
  browser.scraped.fmk_online_dk_name_cpr = nameCpr;
  return browser;
}

async function odensebibDk(browser) {
  let { id, page } = browser;
  await page.goto('https://www.odensebib.dk/gatewayf/login?destination=frontpage');
  await page.waitForSelector('.login-topmenu.mypage');
  await page.goto('https://www.odensebib.dk/user');
  try {
    firstLoan = await page.waitForSelector('#ding-loan-loans-form .tablesorter td', { visible: true });
    console.log("loans: " + firstLoan);
    await page.screenshot({ path: `${id}/odensebib_dk_first_loan.png` });
    browser.scraped.odensebib_dk_first_loan = firstLoan;
  } catch {}
  return browser;
}

const scrapers = composeAsync(postBorgerDk, sundhedDk, fmk-onlineDk, odensebibDk);

const server = http.createServer((req, res) => {
  function start(err, body) {
    if (err) {
      res.statusCode = 500;
      return res.end("Bad JSON");
    }

    let id = uuidv4();
    fs.mkdirSync(id); // folder for screenshots.
    let browser = Browser.create(id);
    browsers[id] = browser;

    sendJson(req, res, { id });

    login(browser, body.username, body.password)
    .then(() => otpRequest(browser))
    .then(otpRequestCode => browser.otpRequestCode = otpRequestCode)
    .catch(async (ex) => {
      if (process.env.TRACE) {
        await page.tracing.stop();
      }
      // rethrow it for debugging.
      throw ex;
    });
  }

  function poll(err, body) {
    if (err) {
      res.statusCode = 500;
      return res.end("Bad JSON");
    }

    let id = body.id;

    if (!browsers[id]) {
      res.statusCode = 404;
      return res.end("Not Found");
    }

    const {
      unreadMessages, otpRequestCode, waitingForAppAck, page
    } = browsers[id];
    sendJson(req, res, { unreadMessages, otpRequestCode, waitingForAppAck });
  }
  function responseCode(err, body) {
    if (err) {
      res.statusCode = 500;
      return res.end("Bad JSON");
    }

    let id = body.id;

    if (!browsers[id]) {
      res.statusCode = 404;
      return res.end("Not Found");
    }

    let browser = browser[id];
    let otpResponseCode = body.otpResponseCode;
    submitOTP(browsers.page, otpResponseCode)
    .then(() => scrapers(browser))
    .catch(async (ex) => {
      if (process.env.TRACE) {
        await browsers[id].page.tracing.stop();
      }
      // Rethrow for debugging.
      throw ex;
    });
    res.end();
  }
  function screenshot(err, body) {
    if (err) {
      res.statusCode = 500;
      return res.end("Bad JSON");
    }

    let id = body.id;

    if (!browsers[id]) {
      res.statusCode = 404;
      return res.end("Not Found");
    }

    browsers[id].page.screenshot().then((screenshot) => {
      res.setHeader("content-type", "image/png");
      res.end(screenshot);
    });
  }

  if (req.url === "/start") {
    jsonBody(req, {}, start);
  } else if (req.url === "/poll") {
    jsonBody(req, {}, poll);
  } else if (req.url === "/screenshot") {
    jsonBody(req, {}, screenshot);
  } else if (req.url === "/responseCode") {
    jsonBody(req, {}, responseCode);
  } else {
    file.serve(req, res);
  }
});

server.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});
