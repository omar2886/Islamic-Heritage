import './App.css'
import { HeritageWorkspace } from './features/workspace/HeritageWorkspace'
import { Badge } from './shared/ui/Badge'
import { ButtonLink } from './shared/ui/ButtonLink'
import { FeatureCard } from './shared/ui/FeatureCard'
import { SectionHeading } from './shared/ui/SectionHeading'

const deliveryTrack = [
  {
    step: 'Entrada guiada',
    detail:
      'La beta ya debe permitir capturar el caso por pasos sin exponer roles tecnicos ni tablas densas desde el inicio.',
  },
  {
    step: 'Calculo fiable',
    detail:
      'El builder nuevo sigue dialogando con `calc.php`, pero a traves de contratos tipados y mapeadores puros controlados.',
  },
  {
    step: 'Deploy sin miedo',
    detail:
      'La nueva interfaz sigue entrando por el Strangler en `public/`, lista para convivir con la version estable hasta cerrar la beta.',
  },
]

function App() {
  return (
    <div className="pageShell">
      <header className="topBar">
        <div>
          <p className="brandKicker">Heritage</p>
          <p className="brandTitle">Islamic inheritance, rebuilt with clarity.</p>
        </div>

        <div className="topBar__actions">
          <Badge tone="accent">UI Next</Badge>
          <Badge tone="success">Beta ring active</Badge>
        </div>
      </header>

      <main className="pageMain">
        <section className="heroPanel">
          <div className="heroPanel__copy">
            <p className="heroEyebrow">Objetivo final del producto</p>
            <h1>
              Una calculadora Maliki que guie, explique y transmita confianza.
            </h1>
            <p className="heroLead">
              La nueva web ya no debe parecer una herramienta interna. Tiene que
              recoger el caso con calma, conducir al usuario hasta un calculo
              valido y devolver un reparto claro, entendible y profesional.
            </p>

            <div className="heroActions">
              <ButtonLink href="#builder">Probar el builder beta</ButtonLink>
              <ButtonLink href="?beta=0" variant="secondary">
                Volver a la estable
              </ButtonLink>
            </div>

            <div className="heroBadges" aria-label="Principios del producto">
              <Badge>Schema-first</Badge>
              <Badge>CaseDraft</Badge>
              <Badge>Explainability first</Badge>
              <Badge>Deploy-safe Strangler</Badge>
            </div>
          </div>

          <aside className="heroPanel__aside">
            <div className="heroNote">
              <p className="heroNote__label">Criterio de cierre</p>
              <ul className="heroNote__list">
                <li>Guiado para quien no domina la nomenclatura juridica.</li>
                <li>Rigurosamente conectado al motor real.</li>
                <li>Serio y claro al exponer el reparto.</li>
                <li>Seguro para subirlo a servidor via beta ring.</li>
              </ul>
            </div>
          </aside>
        </section>

        <HeritageWorkspace />

        <section className="contentSection" id="vision">
          <SectionHeading
            eyebrow="Direccion UX"
            title="La beta nueva ya tiene que parecer la web final"
            description="Cada bloque que conservamos en ui-next debe empujar hacia una experiencia profesional: captura clara, revision confiable y resultados inteligibles."
          />

          <div className="featureGrid">
            <FeatureCard eyebrow="Entrada" title="Builder por cercania">
              La pregunta ya no es “que rol tecnico quieres enviar”, sino “quien
              sigue vivo y como se relaciona con el causante”.
            </FeatureCard>

            <FeatureCard eyebrow="Comprension" title="Revision previa">
              Antes de disparar el motor, la UI explica que se va a enviar y
              ayuda a detectar huecos o incoherencias del caso.
            </FeatureCard>

            <FeatureCard eyebrow="Resultado" title="Reparto explicable">
              El resultado ya no debe ser un JSON expuesto. Tiene que leerse como
              una decision clara: quien recibe, cuanto recibe y por que.
            </FeatureCard>

            <FeatureCard eyebrow="Profundidad" title="Auditoria separada">
              El detalle tecnico sigue disponible para validar la logica, pero en
              una capa secundaria que no contamine el flujo principal.
            </FeatureCard>
          </div>
        </section>

        <section className="contentSection" id="delivery">
          <SectionHeading
            eyebrow="Barra de cierre"
            title="Lo que tenemos que validar al subir la beta"
            description="La app debe sostenerse visualmente, funcionar bien bajo subruta y demostrar que la nueva UX ya supera a la antigua en claridad y confianza."
          />

          <div className="trackGrid">
            {deliveryTrack.map((item, index) => (
              <article className="trackCard" key={item.step}>
                <p className="trackCard__index">0{index + 1}</p>
                <h3 className="trackCard__title">{item.step}</h3>
                <p className="trackCard__body">{item.detail}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="contentSection contentSection--dense" id="product">
          <SectionHeading
            eyebrow="Estado actual"
            title="La siguiente iteración ya no debe ser una demo"
            description="A partir de aquí cada pieza que añadamos debe empujar hacia la beta cerrada que puedas subir y evaluar en servidor."
          />

          <div className="closingPanel">
            <div>
              <h3>Prioridad inmediata</h3>
              <p>
                Cerrar design tokens, layout, navegación base y el primer shell
                del builder para que la experiencia deje de depender de una
                landing temporal.
              </p>
            </div>

            <div>
              <h3>Condición de éxito</h3>
              <p>
                Que al subirla al server puedas probar una UI nueva coherente,
                estable en subruta y claramente superior en claridad, tono y
                estructura a la actual.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
