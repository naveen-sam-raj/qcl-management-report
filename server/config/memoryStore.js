const bcrypt = require('bcryptjs');

/**
 * Enterprise In-Memory Document Store
 * Provides seamless zero-config fallback if local MongoDB service is absent,
 * ensuring 100% reliable execution out-of-the-box.
 */
class MemoryCollection {
  constructor(name) {
    this.name = name;
    this.docs = [];
  }

  _generateId() {
    return Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
  }

  async countDocuments(filter = {}) {
    return this.find(filter).then((res) => res.length);
  }

  find(filter = {}) {
    let result = this.docs.filter((doc) => this._matchFilter(doc, filter));
    return new QueryCursor([...result], this);
  }

  findOne(filter = {}) {
    let doc = this.docs.find((d) => this._matchFilter(d, filter));
    return new SingleDocCursor(doc ? { ...doc } : null, this);
  }

  findById(id) {
    if (!id) return new SingleDocCursor(null, this);
    const targetId = id._id || id.id || id.toString();
    const doc = this.docs.find((d) => (d._id || d.id || '').toString() === targetId);
    return new SingleDocCursor(doc ? { ...doc } : null, this);
  }

  async create(data) {
    const doc = {
      ...data,
      _id: data._id || this._generateId(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // If User password needs hashing
    if (this.name === 'User' && doc.password && !doc.password.startsWith('$2')) {
      doc.password = await bcrypt.hash(doc.password, 10);
    }

    this._attachMethods(doc);
    this.docs.push(doc);
    return { ...doc };
  }

  async insertMany(arr) {
    const created = [];
    for (const item of arr) {
      const c = await this.create(item);
      created.push(c);
    }
    return created;
  }

  async findByIdAndUpdate(id, update, options = {}) {
    const targetId = (id._id || id.id || id).toString();
    const index = this.docs.findIndex((d) => (d._id || d.id || '').toString() === targetId);
    if (index === -1) return null;

    let current = this.docs[index];
    let updatedData = update.$set ? { ...current, ...update.$set } : { ...current, ...update };

    if (this.name === 'User' && updatedData.password && updatedData.password !== current.password && !updatedData.password.startsWith('$2')) {
      updatedData.password = await bcrypt.hash(updatedData.password, 10);
    }

    updatedData.updatedAt = new Date();
    this._attachMethods(updatedData);
    this.docs[index] = updatedData;
    return options.new === false ? current : { ...updatedData };
  }

  async findByIdAndDelete(id) {
    const targetId = (id._id || id.id || id).toString();
    const index = this.docs.findIndex((d) => (d._id || d.id || '').toString() === targetId);
    if (index === -1) return null;
    const removed = this.docs.splice(index, 1)[0];
    return removed;
  }

  _matchFilter(doc, filter) {
    if (!filter || Object.keys(filter).length === 0) return true;

    for (const key of Object.keys(filter)) {
      const filterVal = filter[key];

      if (key === '$or' && Array.isArray(filterVal)) {
        const anyMatch = filterVal.some((subFilter) => this._matchFilter(doc, subFilter));
        if (!anyMatch) return false;
        continue;
      }

      const docVal = doc[key];

      if (filterVal && typeof filterVal === 'object' && !Array.isArray(filterVal)) {
        if (filterVal.$regex) {
          const regex = new RegExp(filterVal.$regex, filterVal.$options || 'i');
          if (!regex.test(docVal || '')) return false;
          continue;
        }
        if (filterVal.$gte !== undefined && docVal < filterVal.$gte) return false;
        if (filterVal.$lte !== undefined && docVal > filterVal.$lte) return false;
        if (filterVal.$ne !== undefined && (docVal || '').toString() === filterVal.$ne.toString()) return false;
        if (filterVal.$in && Array.isArray(filterVal.$in)) {
          if (!filterVal.$in.includes(docVal)) return false;
          continue;
        }
      }

      if (filterVal !== undefined) {
        const strDocVal = docVal ? (docVal._id || docVal.id || docVal).toString() : '';
        const strFilterVal = filterVal ? (filterVal._id || filterVal.id || filterVal).toString() : '';
        if (strDocVal !== strFilterVal && docVal !== filterVal) {
          return false;
        }
      }
    }
    return true;
  }

  _attachMethods(doc) {
    if (!doc) return;
    if (this.name === 'User') {
      doc.matchPassword = async function (enteredPassword) {
        return await bcrypt.compare(enteredPassword, this.password);
      };
    }
    if (this.name === 'SuperAdmin') {
      doc.comparePassword = async function (candidatePassword) {
        return await bcrypt.compare(candidatePassword, this.passwordHash);
      };
    }
    doc.save = async () => {
      const idx = this.docs.findIndex((d) => (d._id || d.id).toString() === (doc._id || doc.id).toString());
      if (idx !== -1) {
        this.docs[idx] = { ...doc, updatedAt: new Date() };
      }
      return doc;
    };
  }
}

class QueryCursor {
  constructor(results, collection) {
    this.results = results;
    this.collection = collection;
  }

  populate(field) {
    // Populate relations if present
    const store = global.inMemoryStore;
    if (store) {
      this.results = this.results.map((doc) => {
        const clone = { ...doc };
        if (field === 'company' && clone.company) {
          const compId = (clone.company._id || clone.company).toString();
          const comp = store.companies.docs.find((c) => (c._id || c.id).toString() === compId);
          if (comp) clone.company = { ...comp };
        }
        if (field === 'plant' && clone.plant) {
          const plantId = (clone.plant._id || clone.plant).toString();
          const p = store.plants.docs.find((x) => (x._id || x.id).toString() === plantId);
          if (p) clone.plant = { ...p };
        }
        return clone;
      });
    }
    return this;
  }

  select(fields) {
    if (typeof fields === 'string' && fields.includes('-password')) {
      this.results = this.results.map((doc) => {
        const { password, ...rest } = doc;
        this.collection._attachMethods(rest);
        return rest;
      });
    }
    return this;
  }

  sort(sortObj) {
    if (!sortObj) return this;
    const key = Object.keys(sortObj)[0];
    const dir = sortObj[key] === -1 || sortObj[key] === 'desc' ? -1 : 1;
    this.results.sort((a, b) => {
      if (a[key] < b[key]) return -1 * dir;
      if (a[key] > b[key]) return 1 * dir;
      return 0;
    });
    return this;
  }

  limit(num) {
    this.results = this.results.slice(0, num);
    return this;
  }

  skip(num) {
    this.results = this.results.slice(num);
    return this;
  }

  then(resolve, reject) {
    this.results.forEach((doc) => this.collection._attachMethods(doc));
    return Promise.resolve(this.results).then(resolve, reject);
  }
}

class SingleDocCursor {
  constructor(doc, collection) {
    this.doc = doc;
    this.collection = collection;
    if (this.doc) {
      this.collection._attachMethods(this.doc);
    }
  }

  populate(field) {
    if (!this.doc) return this;
    const store = global.inMemoryStore;
    if (store) {
      if (field === 'company' && this.doc.company) {
        const compId = (this.doc.company._id || this.doc.company).toString();
        const comp = store.companies.docs.find((c) => (c._id || c.id).toString() === compId);
        if (comp) this.doc.company = { ...comp };
      }
      if (field === 'plant' && this.doc.plant) {
        const plantId = (this.doc.plant._id || this.doc.plant).toString();
        const p = store.plants.docs.find((x) => (x._id || x.id).toString() === plantId);
        if (p) this.doc.plant = { ...p };
      }
    }
    return this;
  }

  select(fields) {
    if (this.doc && typeof fields === 'string' && fields.includes('-password')) {
      const { password, ...rest } = this.doc;
      this.doc = rest;
      this.collection._attachMethods(this.doc);
    }
    return this;
  }

  then(resolve, reject) {
    return Promise.resolve(this.doc).then(resolve, reject);
  }
}

const getStore = () => {
  if (!global.inMemoryStore) {
    global.inMemoryStore = {
      companies: new MemoryCollection('Company'),
      plants: new MemoryCollection('Plant'),
      users: new MemoryCollection('User'),
      superAdmins: new MemoryCollection('SuperAdmin'),
      reports: new MemoryCollection('Report'),
      logs: new MemoryCollection('ActivityLog'),
    };
  }
  return global.inMemoryStore;
};

module.exports = {
  MemoryCollection,
  getStore,
};
