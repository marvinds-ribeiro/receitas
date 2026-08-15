// Identificadores públicos do projeto Firebase.
//
// NÃO SÃO SEGREDO. A apiKey do Firebase é um identificador de projeto, não uma senha:
// ela viaja dentro de todo app web que fala com o Firebase e qualquer pessoa consegue
// lê-la abrindo o código da página. Quem impede um estranho de ler ou escrever são as
// REGRAS do Firestore (firestore.rules), que só liberam os e-mails da casa.
//
// A senha "cantina" das receitas não tem nada a ver com isto e continua onde estava.
export const configuracao = {
  apiKey: 'AIzaSyBtRJcL4VTFQLl2HB2fnmbMsJcC2evVzl0',
  authDomain: 'receitas-do-marcus.firebaseapp.com',
  projectId: 'receitas-do-marcus',
  storageBucket: 'receitas-do-marcus.firebasestorage.app',
  messagingSenderId: '469585619271',
  appId: '1:469585619271:web:e8a1052b72ab48e8664462',
};
