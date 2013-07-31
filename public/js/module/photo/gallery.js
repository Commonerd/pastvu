/*global define:true, ga:true*/
/**
 * Модель фотографий пользователя
 */
define(['underscore', 'Browser', 'Utils', 'socket', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'renderer', 'model/Photo', 'model/storage', 'text!tpl/photo/gallery.jade', 'css!style/photo/gallery'], function (_, Browser, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, renderer, Photo, storage, jade) {
	'use strict';
	var $window = $(window),
		imgFailTpl = _.template('<div class="imgFail"><div class="failContent" style="${ style }">${ txt }</div></div>');

	return Cliche.extend({
		jade: jade,
		options: {

		},
		create: function () {
			this.auth = globalVM.repository['m/common/auth'];
			this.photos = ko.observableArray();
			this.feed = ko.observable(false);

			this.limit = 30; //Стараемся подобрать кол-во, чтобы выводилось по-строчного. Самое популярное - 6 на строку
			this.perRow = ko.observable(6);
			this.count = ko.observable(0);
			this.loading = ko.observable(false);

			this.scrollActive = false;
			this.scrollHandler = function () {
				if ($window.scrollTop() >= $(document).height() - $window.height() - 140) {
					this.getNextPage();
				}
			}.bind(this);

			this.width = ko.observable('0px');
			this.height = ko.observable('0px');


			this.page = ko.observable(1);
			this.pageSize = ko.observable(this.limit);
			this.pageSlide = ko.observable(2);

			this.pageLast = this.co.pageLast = ko.computed(function () {
				return ((this.count() - 1) / this.pageSize() >> 0) + 1;
			}, this);
			this.pageHasNext = this.co.pageHasNext = ko.computed(function () {
				return this.page() < this.pageLast();
			}, this);
			this.pageHasPrev = this.co.pageHasPrev = ko.computed(function () {
				return this.page() > 1;
			}, this);
			this.pageFirstItem = this.co.pageFirstItem = ko.computed(function () {
				return this.pageSize() * (this.page() - 1) + 1;
			}, this);
			this.pageLastItem = this.co.pageLastItem = ko.computed(function () {
				return Math.min(this.pageFirstItem() + this.pageSize() - 1, this.count());
			}, this);
			this.pages = this.co.pages = ko.computed(function () {
				var pageCount = this.pageLast(),
					pageFrom = Math.max(1, this.page() - this.pageSlide()),
					pageTo = Math.min(pageCount, this.page() + this.pageSlide()),
					result = [],
					i;

				pageFrom = Math.max(1, Math.min(pageTo - 2 * this.pageSlide(), pageFrom));
				pageTo = Math.min(pageCount, Math.max(pageFrom + 2 * this.pageSlide(), pageTo));

				for (i = pageFrom; i <= pageTo; i++) {
					result.push(i);
				}
				return result;
			}, this);
			this.paginationShow = this.co.paginationShow = ko.computed(function () {
				return !this.feed() && this.pageLast() > 1;
			}, this);

			this.briefText = this.co.briefText = ko.computed(function () {
				var txt = '';
				if (this.count()) {
					if (this.feed()) {
						txt = 'Всего ' + this.count() + ' фотографий';
					} else {
						txt = 'Показаны ' + this.pageFirstItem() + ' - ' + this.pageLastItem() + ' из ' + this.count();
					}
				} else {
					txt = 'Пока нет ни одной фотографии';
				}
				return txt;
			}, this);

			this.routeHandlerDebounced = _.throttle(this.routeHandler, 700, {leading: true, trailing: true});

			// Subscriptions
			this.subscriptions.route = globalVM.router.routeChanged.subscribe(this.routeHandlerDebounced, this);
			this.subscriptions.sizes = P.window.square.subscribe(this.sizesCalc, this);

			this.sizesCalc();
			this.routeHandler();
		},
		show: function () {
			globalVM.func.showContainer(this.$container);
			if (this.options.goUpload) {
				window.setTimeout(this.showUpload.bind(this), 500);
			}
			this.showing = true;
		},
		hide: function () {
			this.scrollDeActivate();
			globalVM.func.hideContainer(this.$container);
			this.showing = false;
		},
		makeBinding: function () {
			if (!this.binded) {
				ko.applyBindings(globalVM, this.$dom[0]);
				this.binded = true;
				this.show();
			}
		},

		routeHandler: function () {
			var page = globalVM.router.params().page,
				currPhotoLength = this.photos().length,
				needRecieve = true;

			if (page === 'feed') {
				page = 1;
				this.feed(true);
				this.scrollActivate();
				if (this.page() === 1 && currPhotoLength && currPhotoLength <= this.limit) {
					needRecieve = false; //Если переключаемся на ленту с первой заполненной страницы, то оставляем её данные
				} else {
					this.photos([]);
				}
			} else {
				page = Math.abs(Number(page)) || 1;
				this.feed(false);
				this.scrollDeActivate();
				if (page === 1 && this.page() === 1 && currPhotoLength) {
					needRecieve = false; //Если переключаемся на страницы с ленты, то оставляем её данные для первой страницы
					if (currPhotoLength > this.limit) {
						this.photos.splice(this.limit);
					}
				}
			}

			this.page(page);
			ga('send', 'pageview');
			if (needRecieve) {
				this.getPhotos((page - 1) * this.limit, this.limit, function () {
					this.makeBinding();
				}, this);
			}
		},
		modeSelect: function (feed) {
			globalVM.router.navigateToUrl('/ps' + (feed ? '/feed' : ''));
		},
		scrollActivate: function () {
			if (!this.scrollActive) {
				$window.on('scroll', this.scrollHandler);
				this.scrollActive = true;
			}
		},
		scrollDeActivate: function () {
			if (this.scrollActive) {
				$window.off('scroll', this.scrollHandler);
				this.scrollActive = false;
			}
		},

		getNextPage: function () {
			if (!this.loading()) {
				this.getPhotos(this.photos().length, this.limit);
			}
		},
		getPhotos: function (skip, limit, cb, ctx) {
			this.loading(true);
			this.recievePhotos(skip, limit, function (data) {
				if (!data || data.error) {
					return;
				}
				this.count(data.count); //Вводим полное кол-во фотографий для пересчета пагинации

				if (this.feed()) {
					if (data.photos && data.photos.length) {
						this.photos.concat(data.photos, false);
					}
					if (this.scrollActive && limit > data.photos.length) {
						this.scrollDeActivate();
					}
				} else {
					if (this.page() > this.pageLast()) {
						//Если вызванная страница больше максимальной, выходим и навигируемся на максимальную
						return window.setTimeout(function () {
							globalVM.router.navigateToUrl('/ps/' + this.pageLast());
						}.bind(this), 200);
					}
					this.photos(data.photos);
				}
				this.loading(false);

				if (Utils.isType('function', cb)) {
					cb.call(ctx, data);
				}
			}, this);
		},
		recievePhotos: function (skip, limit, cb, ctx) {
			socket.once('takePhotosPublic', function (data) {
				var i;
				if (!data || data.error || !Array.isArray(data.photos)) {
					window.noty({text: data && data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 3000, force: true});
				} else if (data.skip === skip) {
					for (i = data.photos.length; i--;) {
						Photo.factory(data.photos[i], 'compact', 'h', {title: 'Без названия'});
					}
				}
				if (Utils.isType('function', cb)) {
					cb.call(ctx, data);
				}
			}.bind(this));
			socket.emit('givePhotosPublic', {skip: skip, limit: limit});
		},

		sizesCalc: function () {
			console.log(this.$dom.width());
			var windowW = window.innerWidth, //В @media ширина считается с учетом ширины скролла (кроме chrome<29), поэтому мы тоже должны брать этот размер
				rows = 5,
				domW = this.$dom.width(),
				thumbW,
				thumbH,
				thumbN,
				thumbWMin = 120,
				thumbWMax = 246,
				marginMin;

			if (windowW < 1100) {
				rows = 6;
				marginMin = 8;
			} else if (windowW < 1441) {
				rows = 5;
				marginMin = 10;
			} else {
				rows = 4;
				marginMin = 14;
			}

			thumbN = this.limit / rows >> 0;

			thumbW = Math.max(thumbWMin, Math.min(domW / thumbN - marginMin - 2, thumbWMax)) >> 0;
			thumbH = thumbW / 1.5 >> 0;
			//thumbW = thumbH * 1.5;

			//margin = ((domW % thumbW) / (domW / thumbW >> 0)) / 2 >> 0;

			this.perRow(thumbN);
			this.width(thumbW + 'px');
			this.height(thumbH + 'px');
		},

		onPreviewLoad: function (data, event) {
			event.target.parentNode.parentNode.classList.add('showPrv');
		},
		onPreviewErr: function (data, event) {
			var $photoBox = $(event.target.parentNode),
				parent = $photoBox[0].parentNode,
				content = '';

			event.target.style.visibility = 'hidden';
			if (data.conv) {
				content = imgFailTpl({style: 'margin-top:7px;padding-top:20px; background: url(/img/misc/photoConvWhite.png) 50% 0 no-repeat;', txt: 'Превью уже создается<br>пожалуйста, обновите позже'});
			} else if (data.convqueue) {
				content = imgFailTpl({style: 'margin-top:7px;', txt: '<i class="icon-white icon-road"></i><br>Превью скоро будет создано<br>пожалуйста, обновите позже'});
			} else {
				content = imgFailTpl({style: 'margin-top:7px;padding-top:25px; background: url(/img/misc/imgw.png) 50% 0 no-repeat;', txt: 'Превью недоступно'});
			}
			$photoBox.append(content);
			parent.classList.add('showPrv');
		}
	});
});