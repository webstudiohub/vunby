'use strict';

// Os 5 status válidos do VUNBY (spec v1.1 — imutável)
const STATUS = Object.freeze({
  ENVIADO: 'Enviado',
  VISUALIZADO: 'Visualizado',
  SEM_RESPOSTA: 'Sem resposta',
  APROVADO: 'Aprovado',
  RECUSADO: 'Recusado',
});

const ALL_STATUS = Object.values(STATUS);

// Status que compõem o "Valor em Aberto" no Radar
const OPEN_STATUS = [STATUS.ENVIADO, STATUS.VISUALIZADO, STATUS.SEM_RESPOSTA];

// Status finais — não podem ser alterados pelo prestador
const FINAL_STATUS = [STATUS.APROVADO, STATUS.RECUSADO];

function isValidStatus(s) { return ALL_STATUS.includes(s); }
function isFinal(s) { return FINAL_STATUS.includes(s); }
function isOpen(s) { return OPEN_STATUS.includes(s); }

module.exports = { STATUS, ALL_STATUS, OPEN_STATUS, FINAL_STATUS, isValidStatus, isFinal, isOpen };
