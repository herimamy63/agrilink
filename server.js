const express = require('express');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

const dataDir = path.join(__dirname, 'data');
const demandesFile = path.join(dataDir, 'demandes.json');

fs.mkdirSync(dataDir, { recursive: true });

if (!fs.existsSync(demandesFile)) {
  fs.writeFileSync(demandesFile, '[]\n', 'utf8');
}

app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));

let demandes;

try {
  demandes = JSON.parse(fs.readFileSync(demandesFile, 'utf8'));

  if (!Array.isArray(demandes)) {
    throw new Error('Le fichier doit contenir un tableau JSON.');
  }
} catch (error) {
  console.error('Erreur de lecture des demandes:', error.message);
  process.exit(1);
}

app.get('/api/admin/demandes', (req, res) => {
  const secret = process.env.ADMIN_PASSWORD;
  const fourni = req.get('x-admin-password');
  if (!secret || !fourni || fourni !== secret) {
    return res.status(401).json({ success: false, message: 'Accès refusé.' });
  }
  return res.json({ success: true, demandes });
});
app.get('/api/status', (req, res) => {
  res.json({
    site: 'Agri Link - Jerry',
    status: 'online'
  });
});

function creerDemande(type, req, res) {
  const { nom, telephone, produits, date, adresse, message } =
    req.body || {};

  if (
    typeof nom !== 'string' || !nom.trim() ||
    typeof telephone !== 'string' || !telephone.trim()
  ) {
    return res.status(400).json({
      success: false,
      message: 'Le nom et le téléphone sont obligatoires.'
    });
  }

  const demande = {
    id: crypto.randomUUID(),
    type,
    nom: nom.trim().slice(0, 100),
    telephone: telephone.trim().slice(0, 30),
    produits: Array.isArray(produits) ? produits : [],
    date: typeof date === 'string' ? date.slice(0, 40) : '',
    adresse: typeof adresse === 'string'
      ? adresse.trim().slice(0, 300) : '',
    message: typeof message === 'string'
      ? message.trim().slice(0, 1000) : '',
    statut: 'en_attente',
    creeLe: new Date().toISOString()
  };

  demandes.push(demande);

  try {
    const contenu = JSON.stringify(demandes, null, 2) + '\n';
    const fichierTemp = demandesFile + '.tmp';

    fs.writeFileSync(fichierTemp, contenu, 'utf8');
    fs.renameSync(fichierTemp, demandesFile);
  } catch (error) {
    demandes.pop();
    console.error('Erreur de sauvegarde:', error);

    return res.status(500).json({
      success: false,
      message: 'Impossible de sauvegarder la demande.'
    });
  }

  return res.status(201).json({
    success: true,
    message: 'Demande reçue et sauvegardée.',
    id: demande.id,
    statut: demande.statut
  });
}

app.post('/api/commandes', (req, res) => {
  return creerDemande('commande', req, res);
});

app.post('/api/reservations', (req, res) => {
  return creerDemande('reservation', req, res);
});


 // API_ADMIN_PRODUITS_ET_STATUT
 function adminAutorise(req, res) {
   const secret = process.env.ADMIN_PASSWORD;
   const fourni = req.get('x-admin-password');
   if (!secret || !fourni || fourni !== secret) {
     res.status(401).json({ success: false, message: 'Accès refusé.' });
     return false;
   }
   return true;
 }

 function lireProduits() {
   return JSON.parse(fs.readFileSync(path.join(dataDir, 'produits.json'), 'utf8'));
 }

 function sauverProduits(items) {
   const file = path.join(dataDir, 'produits.json');
   const tmp = file + '.tmp';
   fs.writeFileSync(tmp, JSON.stringify(items, null, 2) + '\n', 'utf8');
   fs.renameSync(tmp, file);
 }

 function sauverDemandes() {
   const tmp = demandesFile + '.tmp';
   fs.writeFileSync(tmp, JSON.stringify(demandes, null, 2) + '\n', 'utf8');
   fs.renameSync(tmp, demandesFile);
 }

 app.get('/api/produits', (req, res) => {
   try {
     res.json({ success: true, produits: lireProduits() });
   } catch (error) {
     res.status(500).json({ success: false, message: 'Erreur de lecture des produits.' });
   }
 });

 app.patch('/api/admin/demandes/:id/statut', (req, res) => {
   if (!adminAutorise(req, res)) return;
   const statuts = ['en_attente', 'confirmee', 'livree', 'annulee'];
   const statut = req.body && req.body.statut;
   if (!statuts.includes(statut)) {
     return res.status(400).json({ success: false, message: 'Statut invalide.' });
   }
   const demande = demandes.find(d => d.id === req.params.id);
   if (!demande) {
     return res.status(404).json({ success: false, message: 'Demande introuvable.' });
   }
   demande.statut = statut;
   demande.modifieLe = new Date().toISOString();
   try {
     sauverDemandes();
     return res.json({ success: true, demande });
   } catch (error) {
     return res.status(500).json({ success: false, message: 'Erreur de sauvegarde.' });
   }
 });

 app.post('/api/admin/produits', (req, res) => {
   if (!adminAutorise(req, res)) return;
   const body = req.body || {};
   if (typeof body.name !== 'string' || !body.name.trim() ||
       !Number.isFinite(Number(body.price)) || Number(body.price) < 0 ||
       typeof body.unit !== 'string' || !body.unit.trim()) {
     return res.status(400).json({ success: false, message: 'Nom, prix et unité obligatoires.' });
   }
   try {
     const produits = lireProduits();
     const id = produits.reduce((max, p) => Math.max(max, Number(p.id) || 0), 0) + 1;
     const item = {
       id,
       name: body.name.trim().slice(0, 100),
       cat: String(body.cat || 'Autres').slice(0, 60),
       price: Number(body.price),
       unit: body.unit.trim().slice(0, 20),
       origin: String(body.origin || 'À confirmer').slice(0, 200),
       stock: String(body.stock || 'À confirmer').slice(0, 100),
       stockQty: Math.max(0, Number(body.stockQty) || 0),
       available: body.available === true,
       img: String(body.img || '').slice(0, 1000),
       desc: String(body.desc || '').slice(0, 500)
     };
     produits.push(item);
     sauverProduits(produits);
     return res.status(201).json({ success: true, produit: item });
   } catch (error) {
     return res.status(500).json({ success: false, message: 'Erreur de sauvegarde du produit.' });
   }
 });

 app.patch('/api/admin/produits/:id', (req, res) => {
   if (!adminAutorise(req, res)) return;
   try {
     const produits = lireProduits();
     const item = produits.find(p => String(p.id) === req.params.id);
     if (!item) return res.status(404).json({ success: false, message: 'Produit introuvable.' });

     const body = req.body || {};
     const champs = ['name', 'cat', 'unit', 'origin', 'stock', 'img', 'desc'];
     for (const champ of champs) {
       if (typeof body[champ] === 'string') item[champ] = body[champ].trim().slice(0, champ === 'desc' ? 500 : 1000);
     }
     if (body.price !== undefined) {
       if (!Number.isFinite(Number(body.price)) || Number(body.price) < 0) {
         return res.status(400).json({ success: false, message: 'Prix invalide.' });
       }
       item.price = Number(body.price);
     }
     if (body.stockQty !== undefined) {
       if (!Number.isFinite(Number(body.stockQty)) || Number(body.stockQty) < 0) {
         return res.status(400).json({ success: false, message: 'Stock invalide.' });
       }
       item.stockQty = Number(body.stockQty);
     }
     if (body.available !== undefined) item.available = body.available === true;

     sauverProduits(produits);
     return res.json({ success: true, produit: item });
   } catch (error) {
     return res.status(500).json({ success: false, message: 'Erreur de sauvegarde du produit.' });
   }
 });

 app.delete('/api/admin/produits/:id', (req, res) => {
   if (!adminAutorise(req, res)) return;
   try {
     const produits = lireProduits();
     const index = produits.findIndex(p => String(p.id) === req.params.id);
     if (index === -1) return res.status(404).json({ success: false, message: 'Produit introuvable.' });
     produits.splice(index, 1);
     sauverProduits(produits);
     return res.json({ success: true, message: 'Produit supprimé.' });
   } catch (error) {
     return res.status(500).json({ success: false, message: 'Erreur de sauvegarde du produit.' });
   }
 });

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Agri Link fonctionne sur le port ${PORT}`);
});
