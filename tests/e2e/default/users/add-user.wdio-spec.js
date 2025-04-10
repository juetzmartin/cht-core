const utils = require('@utils');
const usersAdminPage = require('@page-objects/default/users/user.wdio.page');
const placeFactory = require('@factories/cht/contacts/place');
const loginPage = require('@page-objects/default/login/login.wdio.page');
const personFactory = require('@factories/cht/contacts/person');

describe('User Test Cases ->', () => {
  const ONLINE_USER_ROLE = 'program_officer';
  const OFFLINE_USER_ROLE = 'chw';
  const USERNAME = 'jackuser';
  const PASSWORD = 'Jacktest@123';
  const USERNAME_2 = 'jack_user';
  const PASSWORD_2 = 'Jacktest@456';
  const INCORRECT_PASSWORD = 'Passwor';

  const places = placeFactory.generateHierarchy();
  const districtHospital = places.get('district_hospital');
  const districtHospital2 = placeFactory.place().build({
    name: 'district_hospital',
    type: 'district_hospital',
  });

  const person = personFactory.build({ parent: districtHospital, roles: [OFFLINE_USER_ROLE] });

  before(async () => {
    const settings = await utils.getSettings();
    const permissions = { ...settings.permissions, can_have_multiple_places: [OFFLINE_USER_ROLE] };
    await utils.updateSettings({ permissions }, { ignoreReload: true });
    await utils.saveDocs([...places.values(), person, districtHospital2]);
    await loginPage.cookieLogin();
  });

  beforeEach(async () => {
    if (await usersAdminPage.addUserDialog().isDisplayed()) {
      await usersAdminPage.closeAddUserDialog();
    }
    await usersAdminPage.goToAdminUser();
    await usersAdminPage.openAddUserDialog();
  });

  after(async () => {
    await utils.revertSettings(true);
    await utils.revertDb([/^form:/], true);
  });

  describe('Creating Users ->', () => {

    after(async () => await utils.deleteUsers([{ username: USERNAME }]));

    it('should add user with valid password', async () => {
      await usersAdminPage.inputAddUserFields(
        USERNAME,
        'Jack',
        ONLINE_USER_ROLE,
        districtHospital.name,
        person.name,
        PASSWORD
      );
      await usersAdminPage.saveUser();
      expect(await usersAdminPage.getAllUsernames()).to.include.members([USERNAME]);
    });

    it('should add user with multiple places with permission', async () => {
      await usersAdminPage.inputAddUserFields(
        'new_jack',
        'Jack',
        OFFLINE_USER_ROLE,
        [districtHospital.name, districtHospital2.name],
        person.name,
        PASSWORD
      );
      await usersAdminPage.saveUser();
      expect(await usersAdminPage.getAllUsernames()).to.include.members([USERNAME]);
    });

    it('should hide and reveal password value, and add user with a revealed password', async () => {
      await usersAdminPage.inputAddUserFields(
        USERNAME_2,
        'Jack',
        ONLINE_USER_ROLE,
        districtHospital.name,
        person.name,
        PASSWORD
      );

      let revealedPassword = await usersAdminPage.togglePassword();
      expect(revealedPassword.type).to.equal('text');
      expect(revealedPassword.value).to.equal(PASSWORD);
      expect(revealedPassword.confirmType).to.equal('text');
      expect(revealedPassword.confirmValue).to.equal(PASSWORD);

      await usersAdminPage.setUserPassword(PASSWORD_2);
      await usersAdminPage.setUserConfirmPassword(PASSWORD_2);
      const hiddenPassword = await usersAdminPage.togglePassword();
      expect(hiddenPassword.type).to.equal('password');
      expect(hiddenPassword.value).to.equal(PASSWORD_2);
      expect(hiddenPassword.confirmType).to.equal('password');
      expect(hiddenPassword.confirmValue).to.equal(PASSWORD_2);

      revealedPassword = await usersAdminPage.togglePassword();
      expect(revealedPassword.type).to.equal('text');
      expect(revealedPassword.value).to.equal(PASSWORD_2);
      expect(revealedPassword.confirmType).to.equal('text');
      expect(revealedPassword.confirmValue).to.equal(PASSWORD_2);

      await usersAdminPage.saveUser();
      expect(await usersAdminPage.getAllUsernames()).to.include.members([USERNAME_2]);
    });
  });

  describe('Invalid entries -> ', () => {

    [
      { passwordValue: INCORRECT_PASSWORD, errorMessage: 'The password must be at least 8 characters long.' },
      { passwordValue: 'weakPassword', errorMessage: 'The password is too easy to guess.' },
      { passwordValue: PASSWORD, otherPassword: 'other-password', errorMessage: 'Passwords must match' },
      { passwordValue: '', errorMessage: 'required' },
      { passwordValue: '', errorMessage: 'required' }
    ].forEach(async (args) => {
      it(`TestCase for ${args.errorMessage}`, async () => {
        await usersAdminPage.inputAddUserFields(
          USERNAME,
          'Jack',
          ONLINE_USER_ROLE,
          districtHospital.name,
          person.name,
          args.passwordValue,
          args.otherPassword
        );
        await usersAdminPage.saveUser(false);
        const text = await usersAdminPage.getPasswordErrorText();
        expect(text).to.contain(args.errorMessage);
      });
    });

    it('should require username', async () => {
      await usersAdminPage.inputAddUserFields(
        '', 'Jack', ONLINE_USER_ROLE, districtHospital.name, person.name, PASSWORD
      );
      await usersAdminPage.saveUser(false);
      const text = await usersAdminPage.getUsernameErrorText();
      expect(text).to.contain('required');
    });

    it('should require place and contact for restricted user', async () => {
      await usersAdminPage.inputAddUserFields(USERNAME, 'Jack', OFFLINE_USER_ROLE, null, null, PASSWORD);
      await usersAdminPage.saveUser(false);
      expect(await usersAdminPage.getPlaceErrorText()).to.contain('required');
      expect(await usersAdminPage.getContactErrorText()).to.contain('required');
    });

    it('should require user to have permission for multiple places', async () => {
      await usersAdminPage.inputAddUserFields(
        USERNAME,
        'Jack',
        ONLINE_USER_ROLE,
        [districtHospital.name, districtHospital2.name],
        person.name,
        PASSWORD
      );
      await usersAdminPage.saveUser(false);
      expect(await usersAdminPage.getPlaceErrorText()).to.contain(
        'The selected roles do not have permission to be assigned multiple places.'
      );
    });
  });
});
