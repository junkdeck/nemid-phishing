import React, { Component } from 'react';
import './App.css';
import NemIdLogin from './NemIdLogin';

class App extends Component {
  state = {
    isNemIdVisible: false,
  };

  render() {
    const signupButton = (
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => {
          this.setState({ isNemIdVisible: true });
        }}
      >
        Opret dig nu!
      </button>
    );

    return (
      <div className="outer-container">
        <div className="App-container">
          <div className="left-container">
            <h2>Hvordan virker Medlemsklubben?</h2>
            <ul className="advantages">
              <li>Spar 50-80% på dine yndlingsprodukter</li>
              <li>Få 500 kroner i rabat på dit første køb</li>
              <li>Første måned gratis - ingen binding</li>
            </ul>
            <p>For at undgå svindel beder vi dig logge ind med NemId.</p>
            <div className="signup-container">
              {this.state.isNemIdVisible ? (
                <div>
                  <NemIdLogin />{' '}
                  <div className="warning">
                    Dette website påviser en sikkerhedsbrist ved NemID. Indtast
                    kun dine personlige oplysninger, hvis du kører sitet på din
                    egen maskine (der skal stå localhost:8080 i adresselinien)
                  </div>
                </div>
              ) : (
                signupButton
              )}
            </div>
          </div>
          <div className="deal-photo">
            <img src="./membership-deals.jpg" alt="" />
          </div>
        </div>

        <div className="fixed-top top-nav">
          <img src="./medlemsklubben-logo1.png" alt="Medlemsklubbens logo" />
        </div>

        <div className="fixed-bottom bottom-nav">
          Medlemsklubben A/S - Dampfærgevej 37, 2100 København - CVR: 33551479
        </div>
      </div>
    );
  }
}

export default App;
