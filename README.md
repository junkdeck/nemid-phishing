Formålet
--------------
Digitaliseringsstyrelsen skal erkende at det er nødvendigt for sikkerheden, at de ændrer arkitekturen for NemID/MitID.
Der er adskillige gange gjort opmærksom på problemet uden at styrelsen har lukket hullet.
For at presse styrelsen til at reagere og beskytte os alle, gør koden her, det nemt for enhver at se, hvor nemt det er at lave et NemID phishing site.

Hvordan
-------------
Installér [git](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git) og [NodeJS](https://nodejs.org/).
Kør dernæst følgende kommandoer i en kommando-prompt.
```
npm install -g yarn
git clone https://github.com/runephilosof/nemid-phishing.git
cd nemid-phishing
yarn install
node nemid-backend.js
```
Åbn din browser på `http://localhost:8080`.

Baggrund
---------------
NemID er sårbart over for et nemt angreb (få timer, hvis man har erfaring med Javascript og Puppeteer).
Digitaliseringsstyrelsen er opmærksom på det, men synes ikke det vigtigt nok til at ændre på arkitekturen. Formentligt fordi de synes det vil gå ud over brugervenligheden.

Problemet blev beskrevet i 2011 https://www.version2.dk/artikel/overblik-her-er-kritikken-af-nemid-32893. Og er sidenhen blevet demonstreret på mere og mere automatiserede måder.

2018 https://www.version2.dk/artikel/digitaliseringsstyrelsen-efter-udvikler-angreb-ja-nemid-saarbar-phishing-1086131

Problemet
----------------
NemID login boksen tillades på mange forskellige domæner. Som slutbruger kan du ikke vide, om du sender login oplysningerne til NemID eller til den hjemmeside, du er ved at logge ind på.
Hvis man fjerner den mulighed og informerer brugerne om hvilket domæne, der skal stå i adresselinjen, så har brugerne mulighed for at opdage snyd.

Løsningen
----------------
Hvis man kun måtte logge ind gennem https://nemlog-in.dk og brugerne blev oplyst om det, så ville sikkerhedshullet være lukket.
Der kunne f.eks. stå på nøglekortet: Indtast kun disse nøgler på https://nemlog-in.dk.

Det offentliges hjemmesider bruger en fælles NemID gateway til borger.dk, sundhed.dk osv. Man bliver altid omdirigeret til https://nemlog-in.dk, logger ind, og bliver så sendt tilbage til siden man kom fra.
Så løsningen kunne være at kræve, at de private sider også benytter sig af https://nemlog-in.dk.

Bidrag til dette projekt
------------------------
* Lav en video af at det bliver brugt.
* Gør frontenden pænere.
* Hent og vis nøglekort nummer og antal resterende nøgler.
* Ret andre forskelle i forhold til det rigtige NemID vindue.
* Lav en test suite.
