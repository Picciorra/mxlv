# MXLV - Mercoledì x la Vita

Webapp in sola lettura del gioco del mercoledì. Schermate: Prossimo mercoledì, Classifica (oggi e nel tempo), Calendario (prossimi turni e serate fatte), dettaglio serata, Profilo con figurina e Regolamento.

I dati vengono letti da un Google Sheet pubblicato sul web: tutti i calcoli li fa il foglio,
l'app li mostra. Il riferimento al foglio non è nel repo: la pubblicazione lo prende
dal segreto `MXLV_SHEET_ID` e genera `config.js`. In locale `config.js` va creato a mano
(è escluso da git).

Sito statico, nessuna build: `index.html`, `styles.css`, `app.js`.
Pubblicato con GitHub Pages tramite GitHub Actions (`.github/workflows/deploy.yml`).
