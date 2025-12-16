import { Person } from './person.js';

export class FamilyTree {
  constructor(deceasedGender='male'){
    this.deceased = new Person({ id:'deceased', name:'Causante', gender:deceasedGender, alive:false, role:null });
    this.persons = new Map([ ['deceased', this.deceased] ]);
  }
  setDeceasedGender(g){ this.deceased.gender = g; }
  addPerson(personOrData){
    const p = personOrData instanceof Person ? personOrData : new Person(personOrData);
    if (this.persons.has(p.id)) throw new Error(`Persona ${p.id} duplicada`);
    this.persons.set(p.id,p);
    return p.id;
  }
  listPersons(){ return Array.from(this.persons.values()); }
}
