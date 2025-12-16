import { Person } from '../core/person.js';

export class SiblingsCreator {
  static create(tree, { type, father, mother, males=0, females=0, malesAlive=true, femalesAlive=true }) {
    if (type==='full' && (!father || !mother)) throw new Error('Plenos requieren padre y madre');
    if (type==='consanguine' && !father) throw new Error('Consanguíneos requieren padre');
    if (type==='uterine' && !mother) throw new Error('Uterinos requieren madre');

    const mk = (i, gender, alive) => {
      const id = `${gender==='male'?'bro':'sis'}_${Date.now()}_${i}`;
      const parents = {
        father: type==='uterine' ? null : (father||null),
        mother: type==='consanguine' ? null : (mother||null)
      };
      return new Person({ id, name:id, gender, alive, role:null, parents });
    };

    for(let i=0;i<males;i++) tree.addPerson(mk(i,'male', !!malesAlive));
    for(let i=0;i<females;i++) tree.addPerson(mk(i,'female', !!femalesAlive));
  }
}
