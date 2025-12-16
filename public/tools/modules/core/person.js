export class Person {
  constructor({ id, name='', gender, alive=true, role=null, parents=null, spouses=null }) {
    if (!id) throw new Error('id requerido');
    this.id = id;
    this.name = name;
    this.gender = gender;            // 'male' | 'female'
    this.alive = !!alive;            // boolean
    this.role = role;                // rol canónico o null
    this.parents = parents || { father: null, mother: null };
    this.spouses = spouses || [];    // ids
    this.children = [];              // ids (opcional)
  }
}
