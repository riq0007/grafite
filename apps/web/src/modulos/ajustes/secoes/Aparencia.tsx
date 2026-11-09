import type { DestaquePersonalizado, TemaPersonalizado } from '@grafite/domain';
import {
  ControleDeslizante,
  ControleSegmentado,
  type Densidade,
  destaquePersonalizado,
  destaques,
  Formulario,
  GrupoDeRadios,
  type IdDoDestaque,
  type IdDoTema,
  lapisDoContraste,
  RAIO_BASE_MAXIMO,
  Radio,
  razaoDeContraste,
  Segmento,
  temaPersonalizado,
  temas,
  trilhaDasMatizes,
  variaveisDeCor,
} from '@grafite/ui';
import type { CSSProperties } from 'react';
import {
  RestaurarPadroes,
  TituloDaSecao,
  useAlvoDasPreferencias,
} from '../../../preferencias/alvo.tsx';
import { TEMA_DE_BAIXO, temaEDestaque } from '../../../preferencias/preferencias.ts';
import estilos from './Secoes.module.css';

const NOMES_DOS_DESTAQUES: Record<IdDoDestaque, string> = {
  grafite: 'Grafite',
  azul: 'Azul',
  verde: 'Verde',
  laranja: 'Laranja',
};

const NOMES_DAS_DENSIDADES: Record<Densidade, string> = {
  compacta: 'Compacta',
  normal: 'Normal',
  confortavel: 'Confortável',
};

const IDS_DOS_TEMAS = Object.keys(temas) as IdDoTema[];

/** Os temas escuros separados dos claros, na ordem dos tokens. */
const GRUPOS_DE_TEMAS = [
  { nome: 'Escuros', temas: IDS_DOS_TEMAS.filter((id) => temas[id].tom === 'escuro') },
  { nome: 'Claros', temas: IDS_DOS_TEMAS.filter((id) => temas[id].tom === 'claro') },
];

/** A razão de contraste com uma casa, como "15,2:1". */
const umaCasa = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const razao = (frente: string, fundo: string) =>
  `${umaCasa.format(razaoDeContraste(frente, fundo))}:1`;

/**
 * A trilha da matiz da base, na luminosidade do tom e num croma que deixa a matiz à vista: o dos
 * cinzas, de até 0,06, pintaria uma trilha quase cinza (change tema-personalizado, design, decisão 5).
 */
const trilhaDaBase = (tom: TemaPersonalizado['tom']) =>
  trilhaDasMatizes(tom === 'escuro' ? 0.62 : 0.72, 0.1);

/** O construtor do tema Personalizado: o tom, a matiz, o tingimento e o contraste com o lápis. */
function ConstrutorDoTema({
  entrada,
  aoMudar,
}: {
  entrada: TemaPersonalizado;
  aoMudar: (entrada: TemaPersonalizado) => void;
}) {
  const { tom, matiz, tingimento, contraste } = entrada;
  return (
    <div className={estilos.construtor} data-foco="personalizado">
      <ControleSegmentado
        rotulo="Tom"
        value={tom}
        onChange={(valor) => aoMudar({ ...entrada, tom: valor as TemaPersonalizado['tom'] })}
      >
        <Segmento value="escuro">Escuro</Segmento>
        <Segmento value="claro">Claro</Segmento>
      </ControleSegmentado>
      <ControleDeslizante
        rotulo="Matiz"
        unidade="°"
        minValue={0}
        maxValue={359}
        value={matiz}
        onChange={(valor) => aoMudar({ ...entrada, matiz: valor })}
        trilha={trilhaDaBase(tom)}
        className={estilos.deslizante}
      />
      <ControleDeslizante
        rotulo="Tingimento"
        unidade="%"
        minValue={0}
        maxValue={100}
        value={tingimento}
        onChange={(valor) => aoMudar({ ...entrada, tingimento: valor })}
        className={estilos.deslizante}
      />
      <ControleDeslizante
        rotulo="Contraste"
        unidade="%"
        minValue={0}
        maxValue={100}
        value={contraste}
        onChange={(valor) => aoMudar({ ...entrada, contraste: valor })}
        textoDoValor={(valor) => `${lapisDoContraste(valor)} · ${valor}`}
        textoParaLeitor={(valor) => `${lapisDoContraste(valor)}, ${valor} de 100`}
        className={estilos.deslizante}
      />
    </div>
  );
}

/** O construtor do destaque Personalizado: a matiz e a intensidade, em que 0 é o monocromático. */
function ConstrutorDoDestaque({
  entrada,
  escuro,
  aoMudar,
}: {
  entrada: DestaquePersonalizado;
  escuro: boolean;
  aoMudar: (entrada: DestaquePersonalizado) => void;
}) {
  return (
    <div className={estilos.construtor} data-foco="destaque-personalizado">
      <ControleDeslizante
        rotulo="Matiz do destaque"
        unidade="°"
        minValue={0}
        maxValue={359}
        value={entrada.matiz}
        onChange={(valor) => aoMudar({ ...entrada, matiz: valor })}
        trilha={trilhaDasMatizes(escuro ? 0.74 : 0.52, 0.14)}
        className={estilos.deslizante}
      />
      <ControleDeslizante
        rotulo="Intensidade"
        unidade="%"
        minValue={0}
        maxValue={100}
        value={entrada.intensidade}
        onChange={(valor) => aoMudar({ ...entrada, intensidade: valor })}
        className={estilos.deslizante}
      />
    </div>
  );
}

/**
 * Seção Aparência: tema, destaque, cantos e densidade, com efeito na hora e sem salvar. O tema e o
 * destaque Personalizado abrem o construtor, e a leitura do contraste mede o que vale.
 */
export function SecaoAparencia() {
  const { preferencias, mudar } = useAlvoDasPreferencias();
  const { aparencia } = preferencias;
  const { tema, destaque, densidade, raio, personalizado } = aparencia;
  const valendo = temaEDestaque(aparencia);
  const doPersonalizado = temaPersonalizado(personalizado);
  const amostraDoPersonalizado = variaveisDeCor(
    doPersonalizado,
    destaquePersonalizado(doPersonalizado, aparencia.destaquePersonalizado),
  ) as CSSProperties;
  return (
    <>
      <TituloDaSecao>Aparência</TituloDaSecao>
      <Formulario aria-label="Aparência" onSubmit={(evento) => evento.preventDefault()}>
        <GrupoDeRadios
          rotulo="Tema"
          data-foco="tema"
          value={tema}
          onChange={(valor) => mudar('aparencia', { tema: valor as typeof tema })}
        >
          {GRUPOS_DE_TEMAS.map((grupo) => (
            <div key={grupo.nome} className={estilos.grupoDeOpcoes}>
              <p className={estilos.tituloDoGrupo}>{grupo.nome}</p>
              <div className={estilos.opcoes}>
                {grupo.temas.map((id) => (
                  <Radio key={id} value={id}>
                    {/* Desenhada pelos tokens do próprio tema, com o destaque escolhido. */}
                    <span className={estilos.amostra} aria-hidden="true">
                      <span className={estilos.tela} data-theme={id} data-accent={destaque}>
                        <span className={estilos.janela} />
                      </span>
                    </span>
                    {temas[id].nome}
                  </Radio>
                ))}
              </div>
            </div>
          ))}
          <div className={estilos.grupoDeOpcoes}>
            <p className={estilos.tituloDoGrupo}>Montado por você</p>
            <div className={estilos.opcoes}>
              <Radio value="personalizado">
                {/* Pintada pelas variáveis geradas do tema e do destaque personalizados. */}
                <span className={estilos.amostra} aria-hidden="true">
                  <span
                    className={estilos.tela}
                    data-theme={TEMA_DE_BAIXO[personalizado.tom]}
                    style={amostraDoPersonalizado}
                  >
                    <span className={estilos.janela} />
                  </span>
                </span>
                Personalizado
              </Radio>
            </div>
          </div>
        </GrupoDeRadios>
        {tema === 'personalizado' && (
          <ConstrutorDoTema
            entrada={personalizado}
            aoMudar={(entrada) => mudar('aparencia', { personalizado: entrada })}
          />
        )}

        <GrupoDeRadios
          rotulo="Destaque"
          data-foco="destaque"
          value={destaque}
          onChange={(valor) => mudar('aparencia', { destaque: valor as typeof destaque })}
        >
          <div className={estilos.opcoes}>
            {(Object.keys(destaques) as IdDoDestaque[]).map((id) => (
              <Radio key={id} value={id}>
                <span
                  className={estilos.corDoDestaque}
                  data-theme={tema === 'personalizado' ? TEMA_DE_BAIXO[personalizado.tom] : tema}
                  data-accent={id}
                  aria-hidden="true"
                />
                {NOMES_DOS_DESTAQUES[id]}
              </Radio>
            ))}
            <Radio value="personalizado">
              <span
                className={estilos.corDoDestaque}
                style={
                  {
                    '--cor-destaque': destaquePersonalizado(
                      valendo.tema,
                      aparencia.destaquePersonalizado,
                    ).destaque,
                  } as CSSProperties
                }
                aria-hidden="true"
              />
              Personalizado
            </Radio>
          </div>
        </GrupoDeRadios>
        {destaque === 'personalizado' && (
          <ConstrutorDoDestaque
            entrada={aparencia.destaquePersonalizado}
            escuro={valendo.tema.tom === 'escuro'}
            aoMudar={(entrada) => mudar('aparencia', { destaquePersonalizado: entrada })}
          />
        )}

        <p className={estilos.leitura}>
          {`Texto ${razao(valendo.tema.cores.texto, valendo.tema.cores.superficie)} · Secundário ${razao(
            valendo.tema.cores.texto2,
            valendo.tema.cores.superficie,
          )} · Destaque ${razao(valendo.destaque.destaque, valendo.tema.cores.superficie)}`}
        </p>

        <ControleDeslizante
          rotulo="Cantos"
          data-foco="cantos"
          unidade="px"
          minValue={0}
          maxValue={RAIO_BASE_MAXIMO}
          value={raio}
          onChange={(valor) => mudar('aparencia', { raio: valor })}
          className={estilos.deslizante}
        />

        <ControleSegmentado
          rotulo="Densidade"
          data-foco="densidade"
          value={densidade}
          onChange={(valor) => mudar('aparencia', { densidade: valor as Densidade })}
        >
          {(Object.keys(NOMES_DAS_DENSIDADES) as Densidade[]).map((id) => (
            <Segmento key={id} value={id}>
              {NOMES_DAS_DENSIDADES[id]}
            </Segmento>
          ))}
        </ControleSegmentado>

        <div>
          <RestaurarPadroes secao="aparencia" />
        </div>
      </Formulario>
    </>
  );
}
