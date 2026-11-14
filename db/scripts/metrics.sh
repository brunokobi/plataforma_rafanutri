#!/usr/bin/env bash
# RN-214 — Painel interno do plano gratuito. Lê só as views metrics_* (sem nome, e-mail ou dado clínico).
# Uso (da máquina com a chave SSH da vpsrafa):
#   SSH_KEY=~/vpsOracleBruno/ssh/ssh-key-2026-07-18.key db/scripts/metrics.sh
set -u
KEY="${SSH_KEY:-$HOME/vpsOracleBruno/ssh/ssh-key-2026-07-18.key}"
HOST="${METRICS_HOST:-ubuntu@130.61.140.66}"
ssh -i "$KEY" "$HOST" 'docker exec -i rafanutri-postgres sh -c "psql -U \$POSTGRES_USER -d \$POSTGRES_DB -P pager=off"' <<'SQL'
\echo '== Consultórios no plano gratuito'
select count(*) as consultorios, sum(active_patients) as pacientes_ativos, sum(patients_with_access) as com_acesso_ao_app,
       count(*) filter (where wants_paid_plan) as querem_plano_pago from metrics_free_orgs;
\echo '== Pacientes ativos por consultório (perto do limite de 20)'
select faixa, organizacoes from metrics_active_patients_distribution order by organizacoes desc;
\echo '== Quantos nutricionistas atingiram o limite, por mês'
select * from metrics_limit_hits_monthly order by mes desc limit 12;
\echo '== Convites e ativação da área do paciente'
select * from metrics_activation;
\echo '== Lista de interesse nos planos pagos'
select * from metrics_waitlist order by interessados desc;
SQL
