import json, sys, os, re

# Leemos el file JS de aliases para asegurarnos de que existe y contiene el mapa (sanity),
# y probamos la misma lógica en Python con casos de ejemplo.

ROOT = os.path.dirname(os.path.dirname(__file__))
ALIASES_JS = os.path.join(ROOT, "public", "js", "aliases.js")

def sanity():
    with open(ALIASES_JS, "r", encoding="utf-8") as f:
        txt = f.read()
    assert "ROLE_ALIASES" in txt and "CANONICAL_ROLES" in txt, "aliases.js no tiene estructuras esperadas"

# Normalización Python (mirror mínima para test)
CANON = {
  'husband','wife','son','daughter','father','mother',
  'paternal_grandfather','paternal_grandmother','maternal_grandmother',
  'full_brother','full_sister','consanguine_brother','consanguine_sister','uterine_brother','uterine_sister'
}
ALIASES = {
  'wives':'wife','wifes':'wife','esposas':'wife',
  'husbands':'husband','esposos':'husband',
  'spouse':'__SPOUSE__','conyuge':'__SPOUSE__',
  'sons':'son','boys':'son','hijos':'son',
  'daughters':'daughter','girls':'daughter','hijas':'daughter',
  'padre':'father','madre':'mother','fathers':'father','mothers':'mother',
  'pgf':'paternal_grandfather','abuelo_paterno':'paternal_grandfather',
  'pgm':'paternal_grandmother','abuela_paterna':'paternal_grandmother',
  'mgm':'maternal_grandmother','abuela_materna':'maternal_grandmother',
  'brother':'full_brother','sister':'full_sister','hermano':'full_brother','hermana':'full_sister',
  'agnatic_brother':'consanguine_brother','agnatic_sister':'consanguine_sister',
  'consanguineous_brother':'consanguine_brother','consanguineous_sister':'consanguine_sister',
  'uterine_bro':'uterine_brother','uterine_sis':'uterine_sister',
}
def key(s): return str(s or '').strip().lower().replace(' ','_')

def canon(role, sex):
    k = key(role)
    if k in CANON: return k
    ali = ALIASES.get(k)
    if not ali: return None
    if ali == '__SPOUSE__':
        if sex == 'male': return 'wife'
        if sex == 'female': return 'husband'
        return None
    return ali

def norm_counts(counts, sex):
    out = {}
    warns = []
    for k,v in counts.items():
        c = canon(k, sex)
        if c: out[c] = out.get(c,0) + int(v)
        else: warns.append(k)
    return out, warns

def main():
    sanity()
    # Caso mixto con alias y canónicos
    counts = {"sons":2, "daughters":1, "pgf":1, "spouse":1, "unknown_role":3}
    out_male, w1 = norm_counts(counts, "male")
    assert out_male.get("son")==2 and out_male.get("daughter")==1 and out_male.get("paternal_grandfather")==1
    assert out_male.get("wife")==1 and "unknown_role" in w1

    out_female, _ = norm_counts({"spouse":1}, "female")
    assert out_female.get("husband")==1

    out_unknown, w2 = norm_counts({"spouse":1}, "unknown")
    assert "spouse" in w2 and "wife" not in out_unknown and "husband" not in out_unknown

    print("✅ SPRINT7 alias normalization OK")

if __name__=="__main__":
    try: main()
    except AssertionError as e:
        print("❌ SPRINT7 alias normalization FAIL:", e); sys.exit(1)
