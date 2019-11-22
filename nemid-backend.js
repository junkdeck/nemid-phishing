const http = require('http');
const node_static = require('node-static');
const uuidv4 = require('uuid/v4');
const url = require('url');
const jsonBody = require('body/json');
const sendJson = require('send-data/json');
const puppeteer = require('puppeteer');
const fs = require('fs');

const hostname = '0.0.0.0';
const port = 8080;

const file = new node_static.Server('./build');
let browsers = {};

const applyAsync = (acc, val) => acc.then(val);
const composeAsync = (...funcs) => x =>
  funcs.reduce(applyAsync, Promise.resolve(x));

class Browser {
  scraped = {};
  otpRequestCode = null;
  waitingForAppAck = false;
  page = null;
  loginError = null;

  constructor(id) {
    this.id = id;
  }

  async newPuppeteer() {
    const puppet = await puppeteer.launch({
      slowMo: 250, // slow down by 250ms
      timeout: 60000
      //headless: false,
    });
    const page = await puppet.newPage();
    page.setDefaultTimeout(120000);
    if (process.env.DEBUG) {
      page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    }
    if (process.env.TRACE) {
      await page.tracing.start({ path: 'trace.json', screenshots: true });
    }
    this.page = page;
  }
}

async function login(browser, username, password) {
  let { id, page } = browser;
  console.log('goto login');
  await page.goto('https://post.borger.dk');
  console.log('wait for nemid frame');
  await page.waitForSelector('iframe#nemid_iframe');
  const frame = page.frames().find(frame => frame.name() === 'nemid_iframe');
  await frame.waitForSelector('.userid-pwd input:focus', { visible: true });
  await page.keyboard.type(username);
  await page.keyboard.press('Tab');
  await page.keyboard.type(password);
  await page.screenshot({ path: `${id}/nemlogin_step_1.png` });
  console.log('Send login');
  await page.keyboard.press('Enter');
}

async function checkForLoginError(browser) {
  let { id, page } = browser;
  await page.waitForSelector('iframe#nemid_iframe');
  const frame = page.frames().find(frame => frame.name() === 'nemid_iframe');
  await frame.waitForSelector('button', { visible: true });
  let usernameField = await frame.$('.userid-pwd input:focus', { visible: true });
  if (usernameField) {
    let error = await frame.$eval('.error', node => node.innerText);
    if (!error || error == '') {
      error = 'Fejl i bruger-id eller adgangskode. Har du skiftet adgangskode for nyligt?';
    }
    console.log(error);
    browser.loginError = error;
    throw `Still at login step, error: ${error}`;
  }
}

async function otpRequest(browser) {
  let { id, page } = browser;
  console.log('wait for nemid frame');
  await page.waitForSelector('iframe#nemid_iframe');
  const frame = page.frames().find(frame => frame.name() === 'nemid_iframe');
  await frame.waitForSelector('button', { visible: true });
  let otp = await frame.$('input.otp-input:focus', { visible: true });
  if (!otp) {
    console.log('Switch from app to otp card mode.');
    await frame.click('a.link');
    otp = await frame.waitForSelector('input.otp-input:focus', {
      visible: true
    });
  }
  let otp_query = await otp.evaluate(
    node => node.parentNode.previousSibling.innerText
  );
  console.log('ask for ' + otp_query);
  await page.screenshot({ path: `${id}/nemlogin_step_2.png` });
  return otp_query;
}

async function submitOTP(browser, code) {
  let { id, page } = browser;
  console.log('type otp: ' + code);
  await page.keyboard.type(code);
  console.log('send otp');
  await page.screenshot({ path: `${id}/nemlogin_step_3.png` });
  await page.keyboard.press('Enter');
  await page.waitForSelector('.mailSender');
  return browser;
}

class Scrapers {
  scrapers = [
    this.postBorgerDk,
    this.sundhedDk,
    this.fmk_onlineDk,
    this.odensebibDk
  ];

  // Run the scrapers sequentially, instead of in parallel, to save memory.
  async runSequentially(browser) {
    // scrapers must take browser and return browser for easy chaining.
    return await composeAsync(...this.scrapers)(browser);
  }

  async postBorgerDk(browser) {
    console.log("log in to post.borger.dk");
    try {
      let { id, page } = browser;
      await page.goto('https://post.borger.dk');
      let latestSender = await page.waitForSelector('.mailSender');
      await page.hover('.mailSender');
      browser.scraped.post_borger_dk_latest_sender = latestSender;
      await page.screenshot({ path: `${id}/post_borger_dk_latest_sender.png` });
    } catch (ex) {
      console.log(ex);
    }
    return browser;
  }

  async sundhedDk(browser) {
    console.log("log in to sundhed.dk");
    try {
      let { id, page } = browser;
      await page.goto(
        'https://www.sundhed.dk/login/unsecure/logon.ashx?ReturnUrl=$min_side'
      );
      let doctor = await page.waitForSelector(
        '.ng-binding[ng-bind="apptheme.data.Name"]'
      );
      await page.hover(
        '.ng-binding[ng-bind="apptheme.data.Name"]'
      );
      browser.scraped.sundhed_dk_doctor = doctor;
      await page.screenshot({ path: `${id}/sundhed_dk_doctor.png` });
    } catch (ex) {
      console.log(ex);
    }
    return browser;
  }

  async fmk_onlineDk(browser) {
    console.log("log in to fmk-online.dk");
    try {
      let { id, page } = browser;
      await page.goto('https://fmk-online.dk/fmk/');
      let nameCpr = await page.waitForSelector('#user-name');
      await page.hover('#user-name');
      browser.scraped.fmk_online_dk_name_cpr = nameCpr;
      await page.screenshot({ path: `${id}/fmk_online_dk_name_cpr.png` });
    } catch (ex) {
      console.log(ex);
    }
    return browser;
  }

  async odensebibDk(browser) {
    console.log("log in to odensebib.dk");
    try {
      let { id, page } = browser;
      await page.goto(
        'https://www.odensebib.dk/gatewayf/login?destination=frontpage'
      );
      await page.waitForSelector('.login-topmenu.my-page');
      await page.goto('https://www.odensebib.dk/user');
      let firstLoan = await page.waitForSelector(
        '#ding-loan-loans-form .tablesorter td',
        { visible: true }
      );
      console.log('loans: ' + firstLoan);
      await page.hover(
        '#ding-loan-loans-form .tablesorter td',
        { visible: true }
      );
      await page.screenshot({ path: `${id}/odensebib_dk_first_loan.png` });
      browser.scraped.odensebib_dk_first_loan = firstLoan;
    } catch (ex) {
      console.log(ex);
    }
    return browser;
  }
}

const server = http.createServer((req, res) => {
  function start(err, body) {
    if (err) {
      res.statusCode = 500;
      return res.end('Bad JSON');
    }

    let id = uuidv4();
    fs.mkdirSync(id); // folder for screenshots.
    let browser = new Browser(id);
    browsers[id] = browser;

    sendJson(req, res, { id });

    browser.newPuppeteer()
    .then(() => login(browser, body.username, body.password))
    .then(() => checkForLoginError(browser))
    .then(() => otpRequest(browser))
    .then(otpRequestCode => (browser.otpRequestCode = otpRequestCode))
    .catch(async ex => {
      if (process.env.TRACE) {
        await browser.page.tracing.stop();
      }
      // rethrow it for debugging.
      throw ex;
    });
  }

  function poll(err, body) {
    if (err) {
      res.statusCode = 500;
      return res.end('Bad JSON');
    }

    let id = body.id;

    if (!browsers[id]) {
      res.statusCode = 404;
      return res.end('Not Found');
    }

    const { unreadMessages, otpRequestCode, waitingForAppAck, loginError } = browsers[id];
    sendJson(req, res, { unreadMessages, otpRequestCode, waitingForAppAck, loginError });
  }
  function responseCode(err, body) {
    if (err) {
      res.statusCode = 500;
      return res.end('Bad JSON');
    }

    let id = body.id;

    if (!browsers[id]) {
      res.statusCode = 404;
      return res.end('Not Found');
    }

    let browser = browsers[id];
    let otpResponseCode = body.otpResponseCode;
    submitOTP(browsers, otpResponseCode)
      .then(() => Scrapers.runSequentially(browser))
      .catch(async ex => {
        if (process.env.TRACE) {
          await browser.page.tracing.stop();
        }
        // Rethrow for debugging.
        throw ex;
      });
    res.end();
  }
  function screenshot(err, body) {
    if (err) {
      res.statusCode = 500;
      return res.end('Bad JSON');
    }

    let id = body.id;

    if (!browsers[id] || !browsers[id].page) {
      res.statusCode = 404;
      return res.end('Not Found');
    }

    browsers[id].page.screenshot().then(screenshot => {
      res.setHeader('content-type', 'image/png');
      res.end(screenshot);
    });
  }

  if (req.url === '/start') {
    jsonBody(req, {}, start);
  } else if (req.url === '/poll') {
    jsonBody(req, {}, poll);
  } else if (req.url === '/screenshot') {
    jsonBody(req, {}, screenshot);
  } else if (req.url === '/responseCode') {
    jsonBody(req, {}, responseCode);
  } else if (req.method === 'GET' && url.parse(req.url, true).pathname === '/screenshot') {
    screenshot(null, url.parse(req.url, true).query);
  } else {
    file.serve(req, res);
  }
});

server.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});
