import Model from "../lib/model";
import Moment from "moment";
import { extendMoment } from "moment-range";

import _ from "lodash";

const moment = extendMoment(Moment);

/**
 * http://localhost:3000/dashboard/calendar and strongly integrated to calendar.vue file
 * for going to calendar.vue
 *
 * ->bmp-site-s
 *    -> pages
 *      -> dashboard
 *        -> calendar.vue
 */
export default class extends Model {
	//table name -> blocked_dates
	get table() {
		return "blocked_dates";
	}

	//getDateRange() is a helper function
	getDateRange(startDate, endDate, type) {
		let fromDate = moment(startDate);
		let toDate = moment(endDate);
		let diff = toDate.diff(fromDate, type);
		let dateRange = [];

		for (let i = 0; i <= diff; i++) {
			dateRange.push(moment(startDate).add(i, type).format("YYYY-MM-DD"));
		}

		return dateRange;
	}

	//getTimeRange() helper function for getting time range
	/*Object structure -> this.dateHasFound(startDate)).found[0]
    {
      found: [
        RowDataPacket {
          from_date: '2022-04-18 10:00:00',
          to_date: '2022-04-18 17:00:00',
          date_type: 3
        }
      ],
      dateFound: true
    }
  */
	//this function responsible to showing blocked times range to user and other service provider in bookings model file
	async getTimeRange(startDate, centerId) {
		const timeDuration = await (
			await this.dateHasFound(startDate, centerId)
		).found;

		if (timeDuration.length === 0) {
			return [];
		}

		const timeSlots = timeDuration.map((date) => {
			return {
				fTime: +date.from_date.split(" ")[1].split(":")[0],
				tTime: +date.to_date.split(" ")[1].split(":")[0],
			};
		});

		const start = moment().startOf("day");

		const tTime = timeSlots.map((t) => {
			return t.tTime;
		});

		const fTime = timeSlots.map((f) => {
			return f.fTime;
		});

		let timeRange = [];
		let j = 0;

		while (true) {
			for (let i = +fTime[j]; i <= tTime[j]; i++) {
				timeRange.push(
					moment(start)
						.add(60 * i, "minutes")
						.format("HH:mm")
				);
			}

			if (j === fTime.length - 1) {
				break;
			}
			j++;
		}

		timeRange = new Set(timeRange);

		timeRange = [...timeRange];

		return timeRange;
	}

	async getTimeRangeByCenter(startDate, center_id) {
		// const timeDuration = (await this.dateHasFound(startDate)).found[0];

		let timeDuration = await this.db.raw(
			"select * from blocked_dates where `date_type` = 3 AND ('" +
				startDate +
				"') BETWEEN (`from_date`) AND (`to_date`) and `center_id` = '" +
				center_id +
				"'"
		);

		timeDuration = timeDuration[0][0];

		if (!timeDuration) {
			return [];
		}

		const fTime = timeDuration.from_date.split(" ")[1].split(":");
		const tTime = timeDuration.to_date.split(" ")[1].split(":");

		const start = moment().startOf("day");
		const times = +tTime[0];

		const timeRange = [];

		for (let i = +fTime[0]; i <= times; i++) {
			timeRange.push(
				moment(start)
					.add(60 * i, "minutes")
					.format("HH:mm")
			);
		}

		return timeRange;
	}

	//dateHasFound() is a helper function
	async dateHasFound(startDate, center_id) {
		const found = await this.db
			.select("from_date", "to_date", "date_type")
			.table(this.table)
			.whereRaw(
				"DATE (`from_date`) = '" +
					startDate +
					"' and `center_id` = '" +
					center_id +
					"'"
			);

		return { found, dateFound: found.length !== 0 };
	}

	//insertDateAndType() is a helper function
	async insertDateAndType(startDate, endDate, colName, value, centreId) {
		await this.db(this.table).insert({
			from_date: startDate,
			to_date: endDate,
			[colName]: value,
			center_id: centreId,
		});
	}

	async deleteDate(startDate, centerId) {
		await this.db("blocked_dates")
			.where("from_date", startDate)
			.where("center_id", centerId)
			.del(["id"], { includeTriggerModifications: true });
	}

	async compareAndGetDates(comparisonOperator, id, dateType, centerId) {
		return await this.db
			.select("from_date", "to_date", id, "date_type", "center_id")
			.table(this.table)
			.where("date_type", comparisonOperator, dateType)
			.where("center_id", centerId);
	}

	/**
	 * It will take two arrays of date range and compare both of them
	 * and on the basis of data it will store and
	 * give date types of array
	 */
	async compareAndInsertDate(rangeOne, rangeTwo, colName, centerId) {
		const lengthOne = rangeOne.length - 1;
		const lengthTwo = rangeTwo.length - 1;

		if (rangeOne.length > 1) {
			await this.insertDateAndType(
				`${rangeOne[0]} 00:00:00`,
				`${rangeOne[lengthOne]} 00:00:00`,
				colName,
				2,
				centerId
			);
		} else if (rangeOne.length === 1) {
			await this.insertDateAndType(
				`${rangeOne[0]} 00:00:00`,
				`${rangeOne[lengthOne]} 00:00:00`,
				colName,
				1,
				centerId
			);
		}

		if (rangeTwo.length > 1) {
			await this.insertDateAndType(
				`${rangeTwo[0]} 00:00:00`,
				`${rangeTwo[lengthTwo]} 00:00:00`,
				colName,
				2,
				centerId
			);
		} else if (rangeTwo.length === 1) {
			await this.insertDateAndType(
				`${rangeTwo[0]} 00:00:00`,
				`${rangeTwo[lengthTwo]} 00:00:00`,
				colName,
				1,
				centerId
			);
		}
	}

	/**
	 * helper function for split the range of dates on the basis of delete date
	 * and store into two sperated array (delDate will pop out)
	 */
	splitArrayOfDates(dates, delDate) {
		const one = [];
		const two = [];

		let i = 0;

		for (const date of dates) {
			if (date === delDate) {
				dates.splice(0, i + 1);
				break;
			}
			i++;
			one.push(date);
		}

		two.push(...dates);

		return { one, two };
	}

	//get data from block_dates (found date b/w date range) and date is in column from_date also check by date type
	async getFoundDateAndTypeFromTable(date, centerId) {
		return await this.db.raw(
			"select * from blocked_dates where center_id = '" +
				centerId +
				"' AND DATE(`from_date`) = '" +
				date +
				"' AND date_type IN (1) OR ('" +
				date +
				"' BETWEEN DATE(`from_date`) AND DATE(`to_date`) AND date_type = 2 and center_id = '" +
				centerId +
				"' )"
		);
	}

	async deleteDatesAndUpdate(delDate, centerId) {
		const findType_3 = await this.db.raw(
			"select * from blocked_dates where `date_type` = 3 AND DATE(`from_date`) = '" +
				delDate +
				"' AND `center_id` = '" +
				centerId +
				"'"
		);

		if (findType_3 && findType_3[0].length > 0) {
			await this.db.raw(
				"DELETE from blocked_dates where `date_type` = 3 AND DATE(`from_date`) = '" +
					delDate +
					"' AND `center_id` = '" +
					centerId +
					"'"
			);
		} else {
			const selectDates = await this.getFoundDateAndTypeFromTable(
				delDate,
				centerId
			);

			if (selectDates[0].length === 0) {
				throw new Error("Please enter a valid date");
			}

			//delete date with time
			try {
				const dwt = await this.dateHasFound(delDate, centerId);

				if (dwt.found[0].date_type === 3) {
					await this.deleteDate(dwt.found[0].from_date, centerId);
				}
			} catch (error) {
				//intentionally blank
			}

			let found = selectDates[0];
			found = found[0];

			if (!found) {
				console.log("Not Found");
				return [];
			}

			//delete single date
			if (found.date_type === 1) {
				await this.deleteDate(found.from_date, centerId);
				return [];
			}

			//below logic of range of dates
			const dates = this.getDateRange(found.from_date, found.to_date, "days");

			const dateRange = this.splitArrayOfDates(dates, delDate); // takes array of dates and split it into two array always

			await this.deleteDate(found.from_date, centerId);

			/**
			 * It will take two array of dates and save into db from 0th
			 * index value as first date and last index value as last date of both arrays
			 * according their type for single date type is 1 and different date range type is 2
			 **/
			await this.compareAndInsertDate(
				dateRange.one,
				dateRange.two,
				"date_type",
				centerId
			);
		}
	}

	//force to don't entered the fTime bigger than tTime
	validationForTimeSlots(fTime, tTime) {
		const fT = moment(fTime).format("HH:mm").split(":")[0];
		const tT = moment(tTime).format("HH:mm").split(":")[0];

		if (+fT > +tT || (fTime === tTime && fTime && tTime)) {
			throw new Error("Time slot is invalid!");
		}
	}

	async validationForBlockedDates(startDate, endDate, center_id, bool = false) {
		let timeSlots;

		try {
			timeSlots = (await this.dateHasFound(startDate, center_id)).found[0]
				.date_type;
		} catch (error) {
			console.log("Error in validationForBlockedDates");
		}

		if (timeSlots && bool) {
			throw new Error("This date is already blocked!");
		}

		if (startDate === endDate && startDate && endDate) {
			throw new Error("Please enter valid dates!");
		}

		if (!startDate) {
			throw new Error("Please enter a valid date or time!");
		}
	}

	//force to don't intersect the blocked the which is already in the DB
	async validationForDateRange(startDate, endDate, center) {
		const allDates = await (
			await this.getBlockedDates(center.id)
		).singleAndRangeDates;

		const dateWithTime = await (
			await this.getBlockedDates(center.id)
		).dateWithTime;

		allDates.push(...dateWithTime);

		const getRange = this.getDateRange(startDate, endDate, "days");

		//extract dates from allDates and comare getRange using some() and check every() all values false or not
		//if all values false then getRange array has not intersecting the stored dates
		const d = allDates
			.map((ele) => {
				return getRange.some((isExist) => isExist === ele); //some value match from getRange to allDates (it will return boolean array)
			})
			.every((hasExist) => hasExist === false);

		if (!d) {
			throw new Error(`This date is already in blocked range!`);
		}
	}

	timeSlotsRange(fTime, tTime) {
		fTime = fTime.split(":")[0];
		tTime = tTime.split(":")[0];

		const start = moment().startOf("day");
		const times = +tTime;

		const timeRange = [];

		for (let i = +fTime; i <= times; i++) {
			timeRange.push(
				moment(start)
					.add(60 * i, "minutes")
					.format("HH:mm")
			);
		}

		return timeRange;
	}

	async validationForTimeRange(date, fTime, tTime, center) {
		console.log(date, fTime, tTime, center);
		fTime = fTime.split(" ")[1];
		tTime = tTime.split(" ")[1];

		try {
			const _tRange = this.timeSlotsRange(fTime, tTime);

			const timeSlots = await (await this.getBlockedDates(center)).timeSlots;

			const compareTimes = timeSlots.map((d) => {
				return d[date].some((t) => _tRange.includes(t));
			});
			return compareTimes[0];
		} catch (error) {
			return false;
		}
	}

	splitArrayOfTimeSlots(timeSlots, time) {
		const one = [];
		const two = [];

		let i = 0;

		for (const timeSlot of timeSlots) {
			if (timeSlot === time) {
				timeSlots.splice(0, i + 1);
				break;
			}
			i++;
			one.push(timeSlot);
		}

		two.push(...timeSlots);

		return { one, two };
	}

	async compareAndInsertTimeSlots(timeRangeOne, timeRangeTwo, date, centerId) {
		const lengthOne = timeRangeOne.length - 1;
		const lengthTwo = timeRangeTwo.length - 1;

		if (timeRangeOne.length > 1) {
			await this.db(this.table).insert({
				from_date: `${date} ${timeRangeOne[0]}:00`,
				to_date: `${date} ${timeRangeOne[lengthOne]}:00`,
				["date_type"]: 3,
				center_id: centerId,
			});
		} else if (timeRangeOne.length === 1) {
			await this.db(this.table).insert({
				from_date: `${date} ${timeRangeOne[0]}:00`,
				to_date: `${date} ${timeRangeOne[0]}:00`,
				["date_type"]: 3,
				center_id: centerId,
			});
		}

		if (timeRangeTwo.length > 1) {
			await this.db(this.table).insert({
				from_date: `${date} ${timeRangeTwo[0]}:00`,
				to_date: `${date} ${timeRangeTwo[lengthTwo]}:00`,
				["date_type"]: 3,
				center_id: centerId,
			});
		} else if (timeRangeTwo.length === 1) {
			await this.db(this.table).insert({
				from_date: `${date} ${timeRangeTwo[0]}:00`,
				to_date: `${date} ${timeRangeTwo[0]}:00`,
				["date_type"]: 3,
				center_id: centerId,
			});
		}
	}

	async deleteDateTimeSlots(input, centerId) {
		const { date, time } = input;

		const fullDateTime = `${date} ${time}:00`;

		const find = await this.db.raw(
			"select * from blocked_dates where `date_type` = 3 AND ('" +
				fullDateTime +
				"') BETWEEN (`from_date`) AND (`to_date`) and `center_id` = '" +
				centerId +
				"'"
		);

		if (find[0].length === 0) {
			throw new Error("Date has not blocked time slots!");
		}

		const slots = await this.getTimeRangeByCenter(fullDateTime, centerId);

		const hasTime = slots.find((t) => t === time);

		if (!hasTime) {
			throw new Error("Time is not in the time slots!");
		}

		//it gives two array named one and two
		const arrayOfTimeSlots = this.splitArrayOfTimeSlots(slots, time);

		await this.db.raw(
			"DELETE from blocked_dates where `date_type` = 3 AND ('" +
				fullDateTime +
				"') BETWEEN (`from_date`) AND (`to_date`) and `center_id` = '" +
				centerId +
				"'"
		);

		await this.compareAndInsertTimeSlots(
			arrayOfTimeSlots.one,
			arrayOfTimeSlots.two,
			date,
			centerId
		);
		await this.db.table(this.table).whereRaw("from_date = to_date").delete();
		return {
			date: input.date,
			time: input.time,
		};
	}

	async insertBlockedDates(dateInput, user) {
		let { startDate, endDate, fTime, tTime } = dateInput;
		let bool = !endDate && startDate && !fTime;
		//takes login user data and find relation of center table with users table
		const center = await this.source.model.centers.one(
			{ user: user.id },
			false,
			false,
			"id"
		);

		this.validationForTimeSlots(fTime, tTime);

		await this.validationForBlockedDates(startDate, endDate, center.id, bool);

		let findTypeTwoOnly = await this.db.raw(
			"select * from blocked_dates where `date_type` = 2 AND DATE('" +
				startDate +
				"') BETWEEN DATE(`from_date`) AND DATE(`to_date`) and `center_id` = '" +
				center.id +
				"'"
		);

		try {
			const found = await (
				await this.dateHasFound(startDate, center.id)
			).found[0];

			//update the date b/w date type 1 and 3
			if (found.date_type === 3 || found.date_type === 1) {
				await this.deleteDate(found.from_date);
			} else if (found.date_type === 2) {
				await this.deleteDate(found.from_date);
			}
		} catch (error) {
			//it will empty intentionally if try block won't executed then the other code should not block
		}

		//if only containing start date
		if (!endDate) {
			if (startDate && !fTime) {
				if (
					findTypeTwoOnly[0].length !== 0 &&
					findTypeTwoOnly[0][0].date_type === 2
				) {
					throw new Error(`This date is already in blocked range!`);
				}
				endDate = startDate;
				await this.insertDateAndType(
					startDate,
					endDate,
					"date_type",
					1,
					center.id
				);
			}

			if (startDate && fTime) {
				if (
					findTypeTwoOnly[0].length !== 0 &&
					findTypeTwoOnly[0][0].date_type === 2
				) {
					throw new Error(
						`This date is already in blocked range, please unblock the date if you want to block specific time slots!`
					);
				}

				if (
					await await this.validationForTimeRange(
						startDate,
						fTime,
						tTime,
						center.id
					)
				) {
					throw new Error(`This time slot is already blocked!`);
				}

				const tempStartDate = startDate;
				// console.log(moment(fTime).format("HH:mm"));
				startDate = `${startDate} ${moment(fTime).format("HH:mm")}`;
				endDate = `${tempStartDate} ${moment(tTime).format("HH:mm")}`;

				await this.insertDateAndType(
					startDate,
					endDate,
					"date_type",
					3,
					center.id
				);
			}

			const dateWithFromTimeToTime = {
				dates: [{ date: startDate }],
				time: [{ fTime, tTime }],
			};

			return dateWithFromTimeToTime; //returning data gql format
		}

		await this.validationForDateRange(startDate, endDate, center);

		await this.insertDateAndType(startDate, endDate, "date_type", 2, center.id);

		const date = [{ date: `${startDate} ${endDate}` }];
		return { dates: date, time: [{ fTime, tTime }] };
	}

	/**
	 * getBlockedDates() takes a center id and after
	 * it will return array of single date and range of date
	 * and _dwt will return array of object single date with time
	 */
	async getBlockedDates(centerId) {
		let query = await this.compareAndGetDates("<", "id", 3, centerId);

		const findDateByType = query.map((date) =>
			this.getDateRange(date.from_date, date.to_date, "days")
		); //get obj val and returning a new array

		query = await this.compareAndGetDates("=", "id", 3, centerId);

		let singleAndRangeDates = findDateByType.flat();

		const timeAndDate = query;
		let timeRange = timeAndDate;
		const _timeArray = [];

		timeRange.map((v) => {
			let temp = {
				startDate: v.from_date,
				endDate: v.to_date,
			};
			_timeArray.push(temp);
		});

		query = query.map((date) => {
			return date.from_date.split(" ")[0];
		});

		const dates = singleAndRangeDates.map((d) => {
			return {
				date: d,
			};
		});

		//retrieve data with time slots
		let timeRangeDate = [],
			dw;

		try {
			await Promise.all(
				timeAndDate.map(async (d) => {
					let t = d.from_date.split(" ")[0];
					timeRangeDate.push([t, await this.getTimeRange(t, centerId)]);
				})
			);
		} catch (error) {}

		timeRangeDate = [...new Set(timeRangeDate)];

		dw = _.uniqWith(timeRangeDate, _.isEqual);

		const dateTimeSlotObj = {};

		dw.forEach((v) => {
			let key = v[0];
			let value = v[1];
			dateTimeSlotObj[key] = value;
		});

		return {
			id: centerId,
			dates: dates,
			singleAndRangeDates, //get data (add classes dynamically will show blocked date highlighted)
			dateWithTime: query, //get data (add classes dynamically will show blocked date highlighted)
			_dwt: _timeArray, // get data (passing in events for showing time slot will be displayed on calendar)
			timeSlots: [dateTimeSlotObj], //for temporary timeRangeDate comes here after some modification
		}; //returning data gql format
	}
	async disabledRangesOnly(center, calDate, pet_type, month, year) {
		const today = moment().format("YYYY-MM-DD");
		let dates = await this.db(this.table).whereRaw(
			`date_type	 = 2 and center_id = ${center} and (date(from_date) >= '${today}' ||  date(to_date) >= '${today}' )`
		);
		let b_dates = [];

		for (let date of dates) {
			let start = moment(date.from_date);
			let end = moment(date.to_date);

			while (start <= end) {
				b_dates.push(start.format("YYYY-MM-DD"));
				start.add(1, "days");
			}
		}

		let from = moment(`${year}-${month}-01`, "YYYY-MM-DD").add(-1, "months");

		if (!from.isValid()) {
			from = moment().startOf("month");
		}
		const to = moment(from).add(2, "months");

		const range = moment.range(from, to);

		let d = await this.db("bookings")
			.select(this.db.raw("`bookings`.from,bookings.to"))
			.where("b_type", 1)
			.where("pet_type", pet_type)
			.where("paymentStatus", 1)
			.whereIn("status", [1, 2, 5, 6, 7])
			.where(function () {
				const days = Array.from(range.by("days"));
				days.map((m) =>
					this.orWhereRaw("(? BETWEEN DATE(`from`) AND DATE(`to`))", [
						m.format("YYYY-MM-DD"),
					])
				);
			})
			.groupBy("center")
			.havingRaw(
				"COUNT(id) >= (SELECT capacity from center_capacity WHERE service_id = ? AND pet_type = ? AND center_id = bookings.center)",
				[1, pet_type]
			);
		// console.log(d.toString());
		if (d.length > 0) {
			d = d[0];
			let start = moment(d.from);
			let end = moment(d.to);
			while (start <= end) {
				let dat = start.format("YYYY-MM-DD");
				if (!b_dates.includes(dat)) {
					b_dates.push(dat);
				}
				start.add(1, "days");
			}
		}

		return b_dates;
	}
}
