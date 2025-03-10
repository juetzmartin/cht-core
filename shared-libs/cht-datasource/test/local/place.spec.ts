import sinon, { SinonStub } from 'sinon';
import contactTypeUtils from '@medic/contact-types-utils';
import logger from '@medic/logger';
import { Doc } from '../../src/libs/doc';
import * as Place from '../../src/local/place';
import * as LocalDoc from '../../src/local/libs/doc';
import { expect } from 'chai';
import { LocalDataContext } from '../../src/local/libs/data-context';
import * as Lineage from '../../src/local/libs/lineage';
import * as Core from '../../src/libs/core';

describe('local place', () => {
  let localContext: LocalDataContext;
  let settingsGetAll: SinonStub;
  let warn: SinonStub;
  let debug: SinonStub;
  let isPlace: SinonStub;

  beforeEach(() => {
    settingsGetAll = sinon.stub();
    localContext = {
      medicDb: {} as PouchDB.Database<Doc>,
      settings: { getAll: settingsGetAll }
    } as unknown as LocalDataContext;
    warn = sinon.stub(logger, 'warn');
    debug = sinon.stub(logger, 'debug');
    isPlace = sinon.stub(contactTypeUtils, 'isPlace');
  });

  afterEach(() => sinon.restore());

  describe('v1', () => {
    const settings = { hello: 'world' } as const;

    describe('get', () => {
      const identifier = { uuid: 'uuid' } as const;
      let getDocByIdOuter: SinonStub;
      let getDocByIdInner: SinonStub;

      beforeEach(() => {
        getDocByIdInner = sinon.stub();
        getDocByIdOuter = sinon.stub(LocalDoc, 'getDocById').returns(getDocByIdInner);
      });

      it('returns a place by UUID', async () => {
        const doc = { type: 'clinic' };
        getDocByIdInner.resolves(doc);
        settingsGetAll.returns(settings);
        isPlace.returns(true);

        const result = await Place.v1.get(localContext)(identifier);

        expect(result).to.equal(doc);
        expect(getDocByIdOuter.calledOnceWithExactly(localContext.medicDb)).to.be.true;
        expect(getDocByIdInner.calledOnceWithExactly(identifier.uuid)).to.be.true;
        expect(isPlace.calledOnceWithExactly(settings, doc)).to.be.true;
        expect(warn.notCalled).to.be.true;
      });

      it('returns null if the identified doc does not have a place type', async () => {
        const doc = { type: 'not-place', '_id': 'id' };
        getDocByIdInner.resolves(doc);
        settingsGetAll.returns(settings);
        isPlace.returns(false);

        const result = await Place.v1.get(localContext)(identifier);

        expect(result).to.be.null;
        expect(getDocByIdOuter.calledOnceWithExactly(localContext.medicDb)).to.be.true;
        expect(getDocByIdInner.calledOnceWithExactly(identifier.uuid)).to.be.true;
        expect(isPlace.calledOnceWithExactly(settings, doc)).to.be.true;
        expect(warn.calledOnceWithExactly(`Document [${doc._id}] is not a valid place.`)).to.be.true;
      });

      it('returns null if the identified doc is not found', async () => {
        getDocByIdInner.resolves(null);

        const result = await Place.v1.get(localContext)(identifier);

        expect(result).to.be.null;
        expect(getDocByIdOuter.calledOnceWithExactly(localContext.medicDb)).to.be.true;
        expect(getDocByIdInner.calledOnceWithExactly(identifier.uuid)).to.be.true;
        expect(settingsGetAll.notCalled).to.be.true;
        expect(isPlace.notCalled).to.be.true;
        expect(warn.calledOnceWithExactly(`No place found for identifier [${identifier.uuid}].`)).to.be.true;
      });
    });

    describe('getWithLineage', () => {
      const identifier = { uuid: 'place0' } as const;
      let getLineageDocsByIdInner: SinonStub;
      let getLineageDocsByIdOuter: SinonStub;
      let getDocsByIdsInner: SinonStub;
      let getDocsByIdsOuter: SinonStub;
      let getPrimaryContactIds: SinonStub;
      let hydratePrimaryContactInner: SinonStub;
      let hydratePrimaryContactOuter: SinonStub;
      let hydrateLineage: SinonStub;
      let deepCopy: SinonStub;

      beforeEach(() => {
        getLineageDocsByIdInner = sinon.stub();
        getLineageDocsByIdOuter = sinon
          .stub(Lineage, 'getLineageDocsById')
          .returns(getLineageDocsByIdInner);
        getDocsByIdsInner = sinon.stub();
        getDocsByIdsOuter = sinon
          .stub(LocalDoc, 'getDocsByIds')
          .returns(getDocsByIdsInner);
        getPrimaryContactIds = sinon.stub(Lineage, 'getPrimaryContactIds');
        hydratePrimaryContactInner = sinon.stub();
        hydratePrimaryContactOuter = sinon
          .stub(Lineage, 'hydratePrimaryContact')
          .returns(hydratePrimaryContactInner);
        hydrateLineage = sinon.stub(Lineage, 'hydrateLineage');
        deepCopy = sinon.stub(Core, 'deepCopy');
      });

      afterEach(() => {
        expect(getLineageDocsByIdOuter.calledOnceWithExactly(localContext.medicDb)).to.be.true;
        expect(getDocsByIdsOuter.calledOnceWithExactly(localContext.medicDb)).to.be.true;
      });

      it('returns a place with lineage', async () => {
        const place0 = { _id: 'place0', _rev: 'rev' };
        const place1 = { _id: 'place1', _rev: 'rev' };
        const place2 = { _id: 'place2', _rev: 'rev' };
        const contact0 = { _id: 'contact0', _rev: 'rev' };
        const contact1 = { _id: 'contact1', _rev: 'rev' };
        getLineageDocsByIdInner.resolves([place0, place1, place2]);
        isPlace.returns(true);
        settingsGetAll.returns(settings);
        getPrimaryContactIds.returns([contact0._id, contact1._id]);
        getDocsByIdsInner.resolves([contact0, contact1]);
        const place0WithContact = { ...place0, contact: contact0 };
        const place1WithContact = { ...place1, contact: contact1 };
        hydratePrimaryContactInner.onFirstCall().returns(place0WithContact);
        hydratePrimaryContactInner.onSecondCall().returns(place1WithContact);
        hydratePrimaryContactInner.onThirdCall().returns(place2);
        const place0WithLineage = { ...place0WithContact, lineage: true };
        hydrateLineage.returns(place0WithLineage);
        const copiedPlace = { ...place0WithLineage };
        deepCopy.returns(copiedPlace);

        const result = await Place.v1.getWithLineage(localContext)(identifier);

        expect(result).to.equal(copiedPlace);
        expect(getLineageDocsByIdInner.calledOnceWithExactly(identifier.uuid)).to.be.true;
        expect(isPlace.calledOnceWithExactly(settings, place0)).to.be.true;
        expect(warn.notCalled).to.be.true;
        expect(debug.notCalled).to.be.true;
        expect(getPrimaryContactIds.calledOnceWithExactly([place0, place1, place2])).to.be.true;
        expect(getDocsByIdsInner.calledOnceWithExactly([contact0._id, contact1._id])).to.be.true;
        expect(hydratePrimaryContactOuter.calledOnceWithExactly([contact0, contact1])).to.be.true;
        expect(hydratePrimaryContactInner.calledThrice).to.be.true;
        expect(hydratePrimaryContactInner.calledWith(place0)).to.be.true;
        expect(hydratePrimaryContactInner.calledWith(place1)).to.be.true;
        expect(hydratePrimaryContactInner.calledWith(place2)).to.be.true;
        expect(hydrateLineage.calledOnceWithExactly(place0WithContact, [place1WithContact, place2])).to.be.true;
        expect(deepCopy.calledOnceWithExactly(place0WithLineage)).to.be.true;
      });

      it('returns null when no place or lineage is found', async () => {
        getLineageDocsByIdInner.resolves([]);

        const result = await Place.v1.getWithLineage(localContext)(identifier);

        expect(result).to.be.null;
        expect(getLineageDocsByIdInner.calledOnceWithExactly(identifier.uuid)).to.be.true;
        expect(isPlace.notCalled).to.be.true;
        expect(warn.calledOnceWithExactly(`No place found for identifier [${identifier.uuid}].`)).to.be.true;
        expect(debug.notCalled).to.be.true;
        expect(getPrimaryContactIds.notCalled).to.be.true;
        expect(getDocsByIdsInner.notCalled).to.be.true;
        expect(hydratePrimaryContactOuter.notCalled).to.be.true;
        expect(hydratePrimaryContactInner.notCalled).to.be.true;
        expect(hydrateLineage.notCalled).to.be.true;
        expect(deepCopy.notCalled).to.be.true;
      });

      it('returns null if the doc returned is not a place', async () => {
        const place0 = { _id: 'place0', _rev: 'rev' };
        const place1 = { _id: 'place1', _rev: 'rev' };
        const place2 = { _id: 'place2', _rev: 'rev' };
        getLineageDocsByIdInner.resolves([place0, place1, place2]);
        isPlace.returns(false);
        settingsGetAll.returns(settings);

        const result = await Place.v1.getWithLineage(localContext)(identifier);

        expect(result).to.be.null;
        expect(getLineageDocsByIdInner.calledOnceWithExactly(identifier.uuid)).to.be.true;
        expect(isPlace.calledOnceWithExactly(settings, place0)).to.be.true;
        expect(warn.calledOnceWithExactly(`Document [${identifier.uuid}] is not a valid place.`)).to.be.true;
        expect(debug.notCalled).to.be.true;
        expect(getPrimaryContactIds.notCalled).to.be.true;
        expect(getDocsByIdsInner.notCalled).to.be.true;
        expect(hydratePrimaryContactOuter.notCalled).to.be.true;
        expect(hydratePrimaryContactInner.notCalled).to.be.true;
        expect(hydrateLineage.notCalled).to.be.true;
        expect(deepCopy.notCalled).to.be.true;
      });

      it('returns a place if no lineage is found', async () => {
        const place = { _id: 'place0', _rev: 'rev' };
        getLineageDocsByIdInner.resolves([place]);
        isPlace.returns(true);
        settingsGetAll.returns(settings);

        const result = await Place.v1.getWithLineage(localContext)(identifier);

        expect(result).to.equal(place);
        expect(getLineageDocsByIdInner.calledOnceWithExactly(identifier.uuid)).to.be.true;
        expect(isPlace.calledOnceWithExactly(settings, place)).to.be.true;
        expect(warn.notCalled).to.be.true;
        expect(debug.calledOnceWithExactly(`No lineage places found for place [${identifier.uuid}].`)).to.be.true;
        expect(getPrimaryContactIds.notCalled).to.be.true;
        expect(getDocsByIdsInner.notCalled).to.be.true;
        expect(hydratePrimaryContactOuter.notCalled).to.be.true;
        expect(hydratePrimaryContactInner.notCalled).to.be.true;
        expect(hydrateLineage.notCalled).to.be.true;
        expect(deepCopy.notCalled).to.be.true;
      });
    });

    describe('getPage', () => {
      const limit = 3;
      const cursor = null;
      const notNullCursor = '5';
      const placeIdentifier = 'place';
      const placeTypeQualifier = {contactType: placeIdentifier} as const;
      const invalidPlaceTypeQualifier = { contactType: 'invalid' } as const;
      const placeType = [{person: true, id: placeIdentifier}] as Record<string, unknown>[];
      let getPlaceTypes: SinonStub;
      let queryDocsByKeyInner: SinonStub;
      let queryDocsByKeyOuter: SinonStub;
      let fetchAndFilterInner: SinonStub;
      let fetchAndFilterOuter: SinonStub;

      beforeEach(() => {
        queryDocsByKeyInner = sinon.stub();
        queryDocsByKeyOuter = sinon.stub(LocalDoc, 'queryDocsByKey').returns(queryDocsByKeyInner);
        getPlaceTypes = sinon.stub(contactTypeUtils, 'getPlaceTypes').returns(placeType);
        settingsGetAll.returns(settings);
        fetchAndFilterInner = sinon.stub();
        fetchAndFilterOuter = sinon.stub(LocalDoc, 'fetchAndFilter').returns(fetchAndFilterInner);
      });

      it('returns a page of places', async () => {
        const doc = { type: 'place' };
        const docs = [doc, doc, doc];
        const expectedResult = {
          cursor: '3',
          data: docs
        };
        fetchAndFilterInner.resolves(expectedResult);

        const res = await Place.v1.getPage(localContext)(placeTypeQualifier, cursor, limit);

        expect(res).to.deep.equal(expectedResult);
        expect(settingsGetAll.callCount).to.equal(1);
        expect(getPlaceTypes.calledOnceWithExactly(settings)).to.be.true;
        expect(
          queryDocsByKeyOuter.calledOnceWithExactly(localContext.medicDb, 'medic-client/contacts_by_type')
        ).to.be.true;
        expect(queryDocsByKeyInner.notCalled).to.be.true;
        expect(fetchAndFilterOuter.calledOnce).to.be.true;
        expect(fetchAndFilterOuter.firstCall.args[0]).to.be.a('function');
        expect(fetchAndFilterOuter.firstCall.args[1]).to.be.a('function');
        expect(fetchAndFilterOuter.firstCall.args[2]).to.be.equal(limit);
        expect(fetchAndFilterInner.calledOnceWithExactly(limit, Number(cursor))).to.be.true;
        expect(isPlace.notCalled).to.be.true;
      });

      it('returns a page of places when cursor is not null', async () => {
        const doc = { type: 'place' };
        const docs = [doc, doc, doc];
        const expectedResult = {
          cursor: '8',
          data: docs
        };
        fetchAndFilterInner.resolves(expectedResult);

        const res = await Place.v1.getPage(localContext)(placeTypeQualifier, notNullCursor, limit);

        expect(res).to.deep.equal(expectedResult);
        expect(settingsGetAll.callCount).to.equal(1);
        expect(getPlaceTypes.calledOnceWithExactly(settings)).to.be.true;
        expect(
          queryDocsByKeyOuter.calledOnceWithExactly(localContext.medicDb, 'medic-client/contacts_by_type')
        ).to.be.true;
        expect(queryDocsByKeyInner.notCalled).to.be.true;
        expect(fetchAndFilterOuter.firstCall.args[0]).to.be.a('function');
        expect(fetchAndFilterOuter.firstCall.args[1]).to.be.a('function');
        expect(fetchAndFilterOuter.firstCall.args[2]).to.be.equal(limit);
        expect(fetchAndFilterInner.calledOnceWithExactly(limit, Number(notNullCursor))).to.be.true;
        expect(isPlace.notCalled).to.be.true;
      });

      it('throws an error if place type is invalid/does not exist', async () => {
        await expect(Place.v1.getPage(localContext)(invalidPlaceTypeQualifier, cursor, limit)).to.be.rejectedWith(
          `Invalid contact type [${invalidPlaceTypeQualifier.contactType}].`
        );

        expect(settingsGetAll.calledOnce).to.be.true;
        expect(getPlaceTypes.calledOnceWithExactly(settings)).to.be.true;
        expect(queryDocsByKeyOuter.calledOnceWithExactly(localContext.medicDb, 'medic-client/contacts_by_type'))
          .to.be.true;
        expect(queryDocsByKeyInner.notCalled).to.be.true;
        expect(fetchAndFilterInner.notCalled).to.be.true;
        expect(fetchAndFilterOuter.notCalled).to.be.true;
        expect(isPlace.notCalled).to.be.true;
      });

      [
        {},
        '-1',
        undefined,
      ].forEach((invalidSkip ) => {
        it(`throws an error if cursor is invalid: ${JSON.stringify(invalidSkip)}`, async () => {
          await expect(Place.v1.getPage(localContext)(placeTypeQualifier, invalidSkip as string, limit))
            .to.be.rejectedWith(`Invalid cursor token: [${JSON.stringify(invalidSkip)}]`);

          expect(settingsGetAll.calledOnce).to.be.true;
          expect(getPlaceTypes.calledOnceWithExactly(settings)).to.be.true;
          expect(queryDocsByKeyOuter.calledOnceWithExactly(localContext.medicDb, 'medic-client/contacts_by_type'))
            .to.be.true;
          expect(queryDocsByKeyInner.notCalled).to.be.true;
          expect(fetchAndFilterInner.notCalled).to.be.true;
          expect(fetchAndFilterOuter.notCalled).to.be.true;
          expect(isPlace.notCalled).to.be.true;
        });
      });

      it('returns empty array if places does not exist', async () => {
        const expectedResult = {
          data: [],
          cursor
        };
        fetchAndFilterInner.resolves(expectedResult);

        const res = await Place.v1.getPage(localContext)(placeTypeQualifier, cursor, limit);

        expect(res).to.deep.equal(expectedResult);
        expect(settingsGetAll.calledOnce).to.be.true;
        expect(getPlaceTypes.calledOnceWithExactly(settings)).to.be.true;
        expect(
          queryDocsByKeyOuter.calledOnceWithExactly(localContext.medicDb, 'medic-client/contacts_by_type')
        ).to.be.true;
        expect(queryDocsByKeyInner.notCalled).to.be.true;
        expect(fetchAndFilterOuter.firstCall.args[0]).to.be.a('function');
        expect(fetchAndFilterOuter.firstCall.args[1]).to.be.a('function');
        expect(fetchAndFilterOuter.firstCall.args[2]).to.be.equal(limit);
        expect(fetchAndFilterInner.calledOnceWithExactly(limit, Number(cursor))).to.be.true;
        expect(isPlace.notCalled).to.be.true;
      });
    });
  });
});
