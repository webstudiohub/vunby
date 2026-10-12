'use strict';
// "Sem resposta" automático: orçamento Enviado/Visualizado sem nenhuma movimentação há
// NO_RESPONSE_DAYS dias passa para "Sem resposta" e é marcado para follow-up (aparece no Radar).
const { query } = require('./db');
const { STATUS } = require('./status');

const NO_RESPONSE_DAYS = 3;

async function refreshNoResponse(userId) {
  try {
    await query(
      `UPDATE quotes SET status = $1, precisa_follow_up = true
       WHERE user_id = $2 AND status = ANY($3)
         AND COALESCE(updated_at, created_at) < NOW() - make_interval(days => $4)`,
      [STATUS.SEM_RESPOSTA, userId, [STATUS.ENVIADO, STATUS.VISUALIZADO], NO_RESPONSE_DAYS]
    );
  } catch (err) {
    console.error('refreshNoResponse:', err.message);
  }
}

module.exports = { refreshNoResponse, NO_RESPONSE_DAYS };
