/*global define:true*/
/**
 * Модель профиля пользователя
 */
define(['underscore', 'Utils', '../../socket', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'model/User', 'model/storage', 'text!tpl/user/settings.jade', 'css!style/user/settings', 'bs/bootstrap-collapse' ], function (_, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, User, storage, jade) {
	'use strict';

	ko.bindingHandlers.executeOnEnter = {
		init: function (element, valueAccessor, allBindingsAccessor, viewModel) {
			var allBindings = allBindingsAccessor();
			$(element).keypress(function (event) {
				var keyCode = event.which || event.keyCode;
				if (keyCode === 13) {
					allBindings.executeOnEnter.call(viewModel);
					return false;
				}
				return true;
			});
		}
	};

	return Cliche.extend({
		jade: jade,
		options: {
			userVM: null
		},
		create: function () {
			this.auth = globalVM.repository['m/common/auth'];
			this.u = this.options.userVM;
			this.originUser = storage.userImmediate(this.u.login()).origin;
			this.editEmail = ko.observable(false);

			this.showName = this.co.showName = ko.computed(function () {
				return this.u.disp() !== this.u.login();
			}, this);

			ko.applyBindings(globalVM, this.$dom[0]);
			this.show();
		},
		show: function () {
			this.$dom.find("#accordion2 .collapse").collapse({
				toggle: false
			});
			globalVM.func.showContainer(this.$container);
			this.showing = true;
		},
		hide: function () {
			globalVM.func.hideContainer(this.$container);
			this.showing = false;
		},

		toggleDisp: function () {
			socket.once('changeDispNameResult', function (result) {
				if (result && !result.error && result.saved) {
					this.u.disp(result.disp);
					this.originUser.disp = result.disp;
				}
			}.bind(this));
			socket.emit('changeDispName', {login: this.u.login(), showName: !this.showName()});
		},

		saveEmail: function () {
			if (this.editEmail() === true) {
				socket.emit('saveUser', {login: this.u.login(), email: this.u.email()});
			}
			this.editEmail(!this.editEmail());
		}
	});
});