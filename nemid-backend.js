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
const screenshotsFolder = "./build/screenshots";

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
  await page.screenshot({ path: `${screenshotsFolder}/${id}/nemlogin_step_1.png` });
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
  await page.screenshot({ path: `${screenshotsFolder}/${id}/nemlogin_step_2.png` });
  return otp_query;
}

async function submitOTP(browser, code) {
  let { id, page } = browser;
  console.log('type otp: ' + code);
  await page.keyboard.type(code);
  console.log('send otp');
  await page.screenshot({ path: `${screenshotsFolder}/${id}/nemlogin_step_3.png` });
  await page.keyboard.press('Enter');
  await page.waitForSelector('.mailSender');
  return browser;
}

class Scrapers {
  scrapers = [
    this.fmk_onlineDk,
    this.postBorgerDk,
    this.sundhedDk,
    this.odensebibDk
  ];

  // Run the scrapers sequentially, instead of in parallel, to save memory.
  async runSequentially(browser) {
    for (let scraper of this.scrapers) {
      try {
        await scraper(browser, this.waitHoverAndGetText);
      } catch (ex) {
        console.log(ex);
      }
    }
  }

  async waitHoverAndGetText(page, selector, waitOptions) {
    let element = await page.waitForSelector(selector, waitOptions);
    await element.hover();
    return await element.evaluate(node => node.innerText);
  }

  async postBorgerDk(browser, waitHoverAndGetText) {
    console.log("log in to post.borger.dk");
    let { id, page } = browser;
    await page.goto('https://post.borger.dk');
    let latestSender = await waitHoverAndGetText(page, '.mailSender');
    console.log("latest sender: " + latestSender);
    await page.screenshot({ path: `${screenshotsFolder}/${id}/post_borger_dk_latest_sender.png` });
    browser.scraped.post_borger_dk_latest_sender = latestSender;
    return browser;
  }

  async sundhedDk(browser, waitHoverAndGetText) {
    console.log("log in to sundhed.dk");
    let { id, page } = browser;
    await page.goto(
      'https://www.sundhed.dk/login/unsecure/logon.ashx?ReturnUrl=$min_side'
    );
    let doctor = await waitHoverAndGetText(
      page,
      '.ng-binding[ng-bind="apptheme.data.Name"]'
    );
    console.log("doctor: " + doctor);
    await page.screenshot({ path: `${screenshotsFolder}/${id}/sundhed_dk_doctor.png` });
    browser.scraped.sundhed_dk_doctor = doctor;
    return browser;
  }

  async fmk_onlineDk(browser, waitHoverAndGetText) {
    console.log("log in to fmk-online.dk");
    let { id, page } = browser;
    await page.goto('https://fmk-online.dk/fmk/');
    let nameCpr = await waitHoverAndGetText(page, '#user-name');
    console.log('name cpr: ' + nameCpr);
    await page.screenshot({ path: `${screenshotsFolder}/${id}/fmk_online_dk_name_cpr.png` });
    browser.scraped.fmk_online_dk_name_cpr = nameCpr;
    return browser;
  }

  async odensebibDk(browser, waitHoverAndGetText) {
    console.log("log in to odensebib.dk");
    let { id, page } = browser;
    await page.goto(
      'https://www.odensebib.dk/gatewayf/login?destination=frontpage'
    );
    await page.waitForSelector('.login-topmenu.my-page');
    await page.goto('https://www.odensebib.dk/user');
    let firstLoan = await waitHoverAndGetText(
      page,
      '#ding-loan-loans-form .tablesorter td',
      { visible: true }
    );
    console.log('loans: ' + firstLoan);
    await page.screenshot({ path: `${screenshotsFolder}/${id}/odensebib_dk_first_loan.png` });
    browser.scraped.odensebib_dk_first_loan = firstLoan;
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
    fs.mkdirSync(screenshotsFolder);
    fs.mkdirSync(`${screenshotsFolder}/${id}`); // folder for screenshots.
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
    const browser = browsers[id];
    const { scraped, otpRequestCode, waitingForAppAck, loginError } = browser;
    const finished = scraped.sundhed_dk_doctor && browser.page === null;
    sendJson(req, res,
      { scraped, otpRequestCode, waitingForAppAck, loginError, finished }
    );
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
    submitOTP(browser, otpResponseCode)
      .then(() => new Scrapers().runSequentially(browser))
      .finally(async ex => {
        let page = browser.page;
        browser.page = null;
        if (process.env.TRACE) {
          await page.tracing.stop();
        }
        await page.browser().close();
        // Rethrow for debugging.
        throw ex;
      });
    sendJson(req, res, {});
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
