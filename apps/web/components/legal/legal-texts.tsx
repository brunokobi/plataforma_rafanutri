import Link from 'next/link';
import type { ReactNode } from 'react';
import { LEGAL_ENTITY } from '@/lib/legal/info';

function S({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="pt-4 font-display text-xl font-semibold text-foreground">{n}. {title}</h2>
      {children}
    </section>
  );
}
const UL = ({ children }: { children: ReactNode }) => <ul className="list-disc space-y-1 pl-5">{children}</ul>;

/** Quem é o responsável e como falar com ele (usa os dados de LEGAL_ENTITY quando preenchidos). */
export function Responsible() {
  const e = LEGAL_ENTITY;
  return (
    <p>
      A plataforma <strong>{e.name}</strong> é oferecida por {e.legalName ? <strong>{e.legalName}</strong> : 'seus mantenedores'}
      {e.cnpj ? `, CNPJ ${e.cnpj}` : ''}. Contato:{' '}
      {e.email ? <a href={`mailto:${e.email}`} className="text-primary underline">{e.email}</a> : 'pelo botão “Feedback” dentro da plataforma'}
      {e.dpo ? `. Encarregado pelo tratamento de dados pessoais (DPO): ${e.dpo}` : ''}.
    </p>
  );
}

/** Termos de Uso para nutricionistas, consultórios e empresas (contrato de adesão). */
export function ProfessionalTerms() {
  return (
    <>
      <p>Estes Termos de Uso são o contrato entre a Rafanutri e quem cria uma conta profissional — nutricionista, consultório ou empresa (“Profissional” ou “Cliente”). Ao criar a conta ou marcar “Li e aceito”, você declara que leu, entendeu e concorda com estes Termos e com a <Link href="/privacidade" className="text-primary underline">Política de Privacidade</Link>.</p>
      <Responsible />
      <S n={1} title="O que é a Rafanutri">
        <p>Software como serviço (SaaS) para nutrição: cadastro e prontuário de pacientes, agenda, avaliação, planos alimentares, área e app do paciente, gestão do consultório e, para empresas, o módulo de Unidades de Alimentação e Nutrição (UAN) e qualidade. Assistentes de inteligência artificial, quando disponíveis, oferecem <strong>sugestões</strong> — a decisão é sempre do profissional.</p>
      </S>
      <S n={2} title="Conta e acesso">
        <UL>
          <li>Você informa dados verdadeiros e mantém a senha em sigilo; o que for feito com a sua conta é responsabilidade sua.</li>
          <li>A conta é pessoal. A equipe (outros profissionais, gestores, cozinheiros) entra com contas próprias, por convite, com o papel que você definir.</li>
          <li>O profissional declara ter habilitação legal para a atividade (por exemplo, registro ativo no Conselho Regional de Nutricionistas) e mantê-la enquanto usar a plataforma.</li>
        </UL>
      </S>
      <S n={3} title="Planos e pagamento">
        <UL>
          <li>O plano gratuito permite até 20 pacientes ativos, sem cartão e sem prazo. Recursos e limites de cada plano ficam na página de planos.</li>
          <li>Planos pagos são cobrados de forma recorrente, adiantada, pelo período contratado. Sem pagamento, a conta volta ao plano gratuito ou fica só para consulta, sem perda dos dados.</li>
          <li>Contratos Enterprise (por exemplo, UAN por unidade) seguem a proposta ou o contrato assinado, que prevalece sobre estes Termos no que for diferente. Encerrado o contrato, os dados ficam disponíveis para consulta e exportação por 90 dias.</li>
          <li>Mudanças de preço são avisadas com pelo menos 30 dias de antecedência e valem a partir do período seguinte.</li>
        </UL>
      </S>
      <S n={4} title="Responsabilidades do profissional">
        <UL>
          <li>Seguir o Código de Ética do Nutricionista e as normas aplicáveis; a conduta clínica, as prescrições, os planos alimentares, os documentos emitidos e o atendimento são de responsabilidade exclusiva do profissional.</li>
          <li>Revisar tudo o que a plataforma calcula ou sugere (cálculos, substituições, textos-base de POP e Manual, rótulos nutricionais, sugestões de IA) antes de usar ou entregar ao paciente ou cliente. Valores de referência marcados “a validar” precisam da sua revisão.</li>
          <li>Ter base legal para tratar os dados dos seus pacientes e equipe, informá-los e obter o consentimento quando exigido — inclusive para dados de saúde.</li>
          <li>Não usar a plataforma para fins ilícitos, nem inserir conteúdo ofensivo, falso ou que viole direitos de terceiros.</li>
        </UL>
      </S>
      <S n={5} title="Dados dos pacientes (LGPD)">
        <p>Em relação aos dados dos seus pacientes, <strong>o profissional é o controlador</strong> e a Rafanutri é a <strong>operadora</strong>: tratamos esses dados somente para prestar o serviço, conforme as suas instruções e a Lei 13.709/2018 (LGPD). Isso inclui:</p>
        <UL>
          <li>guardar os dados com segurança (acesso por papel, isolamento entre consultórios, conexão criptografada, cópias de segurança);</li>
          <li>não usar os dados dos pacientes para outros fins nem vendê-los;</li>
          <li>avisar sem demora sobre incidente de segurança que possa afetar os titulares;</li>
          <li>apoiar o profissional no atendimento aos direitos dos titulares;</li>
          <li>permitir a exportação dos dados e excluí-los ao fim do contrato, ressalvadas as obrigações legais de guarda (por exemplo, prontuário).</li>
        </UL>
      </S>
      <S n={6} title="Disponibilidade e suporte">
        <p>Trabalhamos para manter a plataforma disponível e segura, mas podem ocorrer interrupções por manutenção, falhas de terceiros (internet, nuvem, e-mail, WhatsApp) ou caso fortuito. Manutenções programadas são feitas, sempre que possível, fora do horário comercial. O suporte é feito pelos canais informados na plataforma.</p>
      </S>
      <S n={7} title="Propriedade intelectual">
        <p>O software, a marca, os modelos e os textos-base da Rafanutri são de seus titulares. O conteúdo que você cria (planos, fichas, documentos, receitas próprias) continua seu; você nos autoriza a armazená-lo e processá-lo apenas para prestar o serviço.</p>
      </S>
      <S n={8} title="Limitação de responsabilidade">
        <p>A Rafanutri não responde por decisões clínicas ou técnicas tomadas com base na plataforma, por dados incorretos inseridos pelo usuário, nem por danos indiretos ou lucros cessantes. Quando houver responsabilidade, ela se limita ao valor pago pelo Cliente nos 12 meses anteriores ao evento, salvo dolo ou o que a lei não permitir limitar.</p>
      </S>
      <S n={9} title="Suspensão e cancelamento">
        <UL>
          <li>Você pode cancelar quando quiser, sem multa nos planos mensais; o acesso pago vale até o fim do período já pago.</li>
          <li>Podemos suspender a conta em caso de uso ilícito, violação destes Termos ou risco à segurança, avisando o motivo.</li>
          <li>Depois do cancelamento, os dados ficam disponíveis para exportação por 90 dias e então são excluídos, salvo obrigação legal de guarda.</li>
        </UL>
      </S>
      <S n={10} title="Alterações destes Termos">
        <p>Podemos atualizar estes Termos. A versão vigente fica nesta página, com a data; mudanças relevantes são avisadas e pedem um novo aceite ao entrar na plataforma.</p>
      </S>
      <S n={11} title="Lei aplicável e foro">
        <p>Vale a lei brasileira. Fica eleito o foro da comarca da sede da Rafanutri, salvo quando a lei garantir outro foro ao Cliente.</p>
      </S>
    </>
  );
}

/** Termos de Uso para pacientes (área e app do paciente). */
export function PatientTerms() {
  return (
    <>
      <p>Estes Termos valem para quem usa a área do paciente da Rafanutri a convite do seu nutricionista. Ao criar seu acesso ou marcar “Li e aceito”, você concorda com eles e com a <Link href="/privacidade" className="text-primary underline">Política de Privacidade</Link>.</p>
      <Responsible />
      <S n={1} title="Para que serve">
        <p>Na área do paciente você vê o plano alimentar, as orientações, as receitas e os documentos que o seu nutricionista publicou, e acompanha a sua evolução. A Rafanutri é a ferramenta: <strong>o atendimento é do seu nutricionista</strong>, que é o responsável pelas orientações.</p>
      </S>
      <S n={2} title="Não substitui o atendimento">
        <UL>
          <li>O conteúdo da área do paciente não substitui consulta. Em caso de dúvida, mal-estar, alergia ou mudança na sua saúde, fale com o seu nutricionista ou procure atendimento de saúde.</li>
          <li>Não use a plataforma para emergências.</li>
        </UL>
      </S>
      <S n={3} title="Seu acesso">
        <UL>
          <li>O acesso é pessoal; guarde a senha em segredo.</li>
          <li>Você pode estar vinculado a mais de um nutricionista; cada um vê só os dados do próprio atendimento.</li>
          <li>Se o nutricionista encerrar o vínculo, você deixa de ver o conteúdo dele.</li>
        </UL>
      </S>
      <S n={4} title="Seus dados de saúde">
        <p>Peso, medidas, hábitos, exames e o plano alimentar são <strong>dados pessoais sensíveis</strong>. Eles são tratados pelo seu nutricionista (controlador), com a Rafanutri como operadora, para o seu acompanhamento nutricional. Ao aceitar estes Termos você <strong>consente</strong> com esse tratamento, na forma do art. 11 da LGPD. Você pode revogar o consentimento a qualquer momento — o que pode impedir a continuidade do acompanhamento pela plataforma —, sem prejuízo do que já foi feito e das obrigações legais de guarda do prontuário pelo profissional.</p>
      </S>
      <S n={5} title="Seus direitos">
        <p>Você pode pedir acesso, correção, portabilidade, informação sobre compartilhamento e exclusão dos seus dados. Faça o pedido ao seu nutricionista; a Rafanutri apoia o atendimento. Também pode falar com a Rafanutri pelo contato acima ou com a Autoridade Nacional de Proteção de Dados (ANPD).</p>
      </S>
      <S n={6} title="Uso adequado">
        <p>Não tente acessar dados de outras pessoas, não compartilhe seu acesso e não use a plataforma para fins ilícitos. O acesso pode ser suspenso em caso de uso indevido.</p>
      </S>
      <S n={7} title="Alterações e foro">
        <p>Estes Termos podem ser atualizados; a versão vigente fica nesta página e mudanças relevantes pedem novo aceite. Vale a lei brasileira e o foro do seu domicílio, como garante o Código de Defesa do Consumidor.</p>
      </S>
    </>
  );
}

/** Política de Privacidade (profissionais, equipe, pacientes e visitantes). */
export function PrivacyPolicy() {
  return (
    <>
      <p>Esta Política explica quais dados pessoais a Rafanutri trata, para quê, com quem compartilha e como você exerce seus direitos, conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018).</p>
      <Responsible />
      <S n={1} title="Papéis">
        <UL>
          <li><strong>Dados da conta profissional</strong> (nome, e-mail, CRN, dados do consultório, cobrança): a Rafanutri é a <strong>controladora</strong>.</li>
          <li><strong>Dados dos pacientes</strong> e dos registros da UAN inseridos pelo profissional ou pela empresa: o profissional ou a empresa é o <strong>controlador</strong> e a Rafanutri é a <strong>operadora</strong>.</li>
        </UL>
      </S>
      <S n={2} title="Quais dados">
        <UL>
          <li>Cadastro: nome, e-mail, telefone, senha (guardada só em forma criptografada), CRN, dados do consultório ou da empresa.</li>
          <li>Pacientes: identificação, contato, anamnese, medidas, exames, planos alimentares, documentos, agenda e mensagens — inclusive <strong>dados de saúde</strong>.</li>
          <li>UAN: registros de qualidade (checklists, temperaturas, fotos de evidência, não conformidades), equipe e treinamentos.</li>
          <li>Uso: registros de acesso e de ações (auditoria), dados do navegador e cookies necessários ao login.</li>
        </UL>
      </S>
      <S n={3} title="Para que e com qual base legal">
        <UL>
          <li>Prestar o serviço contratado e manter a conta (execução de contrato).</li>
          <li>Acompanhamento nutricional do paciente (tutela da saúde, por profissional de saúde, e consentimento do paciente na área do paciente).</li>
          <li>Segurança, prevenção a fraudes e auditoria (legítimo interesse e obrigação legal).</li>
          <li>Cobrança e obrigações fiscais (obrigação legal e execução de contrato).</li>
          <li>Comunicações sobre o serviço; mensagens de marketing só com o seu consentimento, que pode ser retirado a qualquer momento.</li>
        </UL>
      </S>
      <S n={4} title="Inteligência artificial">
        <p>Quando o profissional usa um assistente de IA, apenas as informações necessárias para a sugestão são enviadas ao provedor de IA contratado, sem uso para treinar modelos de terceiros, e a sugestão sempre passa pela revisão do profissional.</p>
      </S>
      <S n={5} title="Compartilhamento">
        <p>Não vendemos dados. Compartilhamos apenas com fornecedores necessários ao serviço (hospedagem em nuvem, banco de dados, envio de e-mail e mensagens, meios de pagamento, provedores de IA), sob contrato e com segurança, e com autoridades quando a lei exigir. Os servidores podem ficar fora do Brasil, com as salvaguardas da LGPD.</p>
        <p>Publicidade: no plano Gratuito, algumas telas da área do profissional que não mostram dados de pacientes (início, alimentos, receitas, questionários, modelos de plano, orientações e Meu plano) exibem anúncios do Google AdSense, não personalizados. Nessas telas o Google pode receber dados técnicos de navegação (endereço IP, navegador, página visitada) e usar cookies próprios para entregar e medir os anúncios, conforme a política do Google. Prontuário, pacientes, agenda, financeiro, área do paciente e documentos nunca têm anúncios, e nenhum dado de paciente é enviado a anunciantes. Os planos pagos não têm anúncios.</p>
      </S>
      <S n={6} title="Segurança">
        <p>Conexão criptografada, senhas com hash, sessão em cookies protegidos (sem acesso por JavaScript), acesso por papel, isolamento entre consultórios e empresas, trilha de auditoria, registros de qualidade que não podem ser apagados e cópias de segurança. Nenhum sistema é infalível; se houver incidente relevante, avisamos os envolvidos e a ANPD como manda a lei.</p>
      </S>
      <S n={7} title="Cookies">
        <p>Usamos cookies essenciais para manter você conectado (sessão), lembrar a escolha de tema e de consultório. Se você desmarcar “Lembrar de mim neste dispositivo”, a sessão termina ao fechar o navegador. Cookies de publicidade só existem nas telas com anúncio do plano Gratuito (ver Compartilhamento), colocados pelo Google para anúncios não personalizados; você pode bloqueá-los no navegador sem perder o acesso.</p>
      </S>
      <S n={8} title="Por quanto tempo">
        <p>Enquanto a conta estiver ativa e pelo tempo necessário para cumprir obrigações legais (por exemplo, a guarda do prontuário pelo profissional e registros fiscais). Depois do cancelamento, os dados ficam disponíveis para exportação por 90 dias e então são excluídos ou anonimizados.</p>
      </S>
      <S n={9} title="Seus direitos">
        <p>Confirmação e acesso, correção, anonimização ou exclusão de dados desnecessários, portabilidade, informação sobre compartilhamento, revogação do consentimento e revisão de decisões automatizadas. Pacientes fazem o pedido ao seu nutricionista (controlador); os demais, pelo contato acima. Você também pode reclamar à ANPD.</p>
      </S>
      <S n={10} title="Alterações">
        <p>Esta Política pode ser atualizada; a versão vigente fica nesta página, com a data. Mudanças relevantes são avisadas e pedem novo aceite.</p>
      </S>
    </>
  );
}
