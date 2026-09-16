'use strict';

/**
 * Estágio 1 do pipeline de coleta para a TRILHA MERCADO (Onda 3) — análogo a
 * lib/vaga-docente.js, mas deliberadamente um módulo PRÓPRIO: o gate de
 * "isso é uma vaga que vale a pena avaliar?" para vaga de mercado não tem
 * NADA a ver com "é concurso público/processo seletivo docente numa
 * universidade?" (lib/vaga-docente.js só entende essa forma). Ver README
 * §Trilha mercado — "a trilha de mercado precisa do seu próprio gate".
 *
 * Ao contrário do DOU (uma listagem diária de ~2000 itens que precisa de
 * regex sobre texto pra decidir "vale a pena buscar o texto completo?"), a
 * Gupy já devolve, por item, campos ESTRUTURADOS (type, country, name,
 * jobUrl, careerPageName) — o gate aqui é checagem de campo, não regex sobre
 * blob de texto. Falso-negativo aqui também é mais barato que no DOU: cada
 * termo de busca (config/keywords-mercado.json → termos_busca) já filtrou
 * por relevância na própria query à API, então este estágio só precisa
 * podar o que claramente não é uma vaga aplicável.
 *
 * Três motivos de rejeição, cada um checado contra um achado real da
 * sondagem (26/08/2026, ver README):
 *   1. `type === 'vacancy_type_talent_pool'` — "Banco de Talentos" não é uma
 *      vaga aberta (é um formulário de interesse genérico, sem cargo/prazo
 *      real — confirmado no texto de i18n da própria Gupy:
 *      "resumeTalentPool"/"Banco de Talentos"). Notificar JB de um banco de
 *      talentos como se fosse vaga real é o mesmo tipo de falso positivo que
 *      o veto de negativos.json evita na trilha docente.
 *   2. `country` presente e diferente de 'Brasil' — o perfil profissional de
 *      JB aceita remoto ou qualquer lugar do BRASIL, não vaga internacional
 *      (achado real: busca
 *      por "IA" trouxe vaga da Stefanini Latam sediada na Colômbia, em
 *      espanhol). Ausência do campo (string vazia/null) fica do lado seguro
 *      — nunca rejeita por omissão de dado, só por sinal explícito contrário.
 *   3. Campos mínimos ausentes (`name`, `jobUrl`, `careerPageName`) — sem
 *      eles não dá pra montar um registro útil (sem título, sem link, sem
 *      empresa) — mesmo princípio de "dado errado é pior que dado faltante"
 *      aplicado no início do pipeline em vez de no fim.
 */

function pareceVagaMercado(rawItem) {
  if (!rawItem) return false;
  if (!rawItem.name || !rawItem.jobUrl || !rawItem.careerPageName) return false;
  if (rawItem.type === 'vacancy_type_talent_pool') return false;
  if (rawItem.country && rawItem.country !== 'Brasil') return false;
  return true;
}

module.exports = { pareceVagaMercado };
