let user_data = {};

function getMsg(msg_type, msg_body) {
	return {
		msg: {
			type: msg_type,
			data: msg_body,
		},
		sender: "content_script",
		id: "irctc",
	};
}

function statusUpdate(status) {
	chrome.runtime.sendMessage(
		getMsg("status_update", {
			status,
			time: Date.now()
		})
	);
}

function addDelay(milliseconds) {
	const date = Date.now();
	let currentDate = null;
	do {
		currentDate = Date.now();
	} while (currentDate - date < milliseconds);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	console.log(message, sender, "content_script");
	if (message.id !== "irctc") {
		sendResponse("Invalid Id");
		return;
	}
	const type = message.msg.type;
	if (type === "selectJourney") {
		selectJourney();
	} else if (type === "fillPassengerDetails") {
		fillPassengerDetails();
	}
	sendResponse("Something went wrong");
});

function loadLoginDetails() {
	statusUpdate("login_started");
	const loginModal = document.querySelector("#divMain > app-login");

	const userNameInput = loginModal.querySelector(
		"input[type='text'][formcontrolname='userid']"
	);
	const passwordInput = loginModal.querySelector(
		"input[type='password'][formcontrolname='password']"
	);

	const captchaInput = loginModal.querySelector(
		"input[type='text'][formcontrolname='captcha']"
	);
    captchaInput.className = 'payment_tex ng-valid ng-dirty ng-touched';


	captchaInput.addEventListener("mouseenter", function() {
		const captcha = document.querySelector(".captcha-img").src;
		console.log("src ::",captcha);
		if (captcha == null) {
			alert("Please Wait...");
		} else {
            performOCRAndSetInput(captcha);
		}
	});

	userNameInput.value = user_data["irctc_credentials"]["user_name"] ?? "";
	userNameInput.dispatchEvent(new Event("input"));
	userNameInput.dispatchEvent(new Event("change"));

	passwordInput.value = user_data["irctc_credentials"]["password"] ?? "";
	passwordInput.dispatchEvent(new Event("input"));
	passwordInput.dispatchEvent(new Event("change"));
	statusUpdate("login_pending");
}

function performOCRAndSetInput(imageUrl) {
    const apiKey = "K88263110488957";
    const apiUrl = "https://api.ocr.space/parse/image";

    // Fetch the image file
    fetch(imageUrl)
        .then(response => response.blob())
        .then(blob => {
            // Create a File object from the blob with the filename "captcha_image.png"
            const file = new File([blob], "captcha_image.png", { type: blob.type });

            // Construct form data for the request
            const formData = new FormData();
            formData.append("language", "eng");
            formData.append("isOverlayRequired", "true");
            formData.append("file", file);

            console.log("Sending OCR request to:", apiUrl);
            console.log("Request body (FormData):", formData);

            // Send the OCR request using fetch
            return fetch(apiUrl, {
                method: "POST",
                headers: {
                    "apikey": apiKey
                },
                body: formData
            });
        })
        .then(response => {
            if (!response.ok) {
                throw new Error("OCR request failed");
            }
            return response.json();
        })
        .then(data => {
            console.log("OCR response data:", data);

            if (data.IsErroredOnProcessing) {
                console.error("OCR request error:", data.ErrorMessage.join("\n"));
                return; // Exit early if there was an error
            }

            // Extract text from the OCR response
            const extractedText = data.ParsedResults[0].ParsedText;
            console.log("Extracted text:", extractedText);
            const captchaInput = document.getElementById("captcha");
            if (captchaInput) {
                captchaInput.value = extractedText;
                const event = new Event('input', { bubbles: true });
                captchaInput.dispatchEvent(event);
            } else {
                console.error("Captcha input element not found");
            }
        })
        .catch(error => {
            console.error("OCR request error:", error);
        });
}



function loadJourneyDetails() {
	statusUpdate("filling_journey_details");
	const form = document.querySelector("app-jp-input form");
	const fromInputField = form.querySelector("#origin > span > input");
	fromInputField.value = user_data["journey_details"]["from"] ?
		`${user_data["journey_details"]["from"]["english_label"]} - ${user_data["journey_details"]["from"]["station_code"]}` :
		"";
	fromInputField.dispatchEvent(new Event("keydown"));
	fromInputField.dispatchEvent(new Event("input"));

	const destinationInputField = form.querySelector(
		"#destination > span > input"
	);
	destinationInputField.value = user_data["journey_details"]["destination"] ?
		`${user_data["journey_details"]["destination"]["english_label"]} - ${user_data["journey_details"]["destination"]["station_code"]}` :
		"";
	destinationInputField.dispatchEvent(new Event("keydown"));
	destinationInputField.dispatchEvent(new Event("input"));

	const dateInputField = form.querySelector("#jDate > span > input");
	dateInputField.value = user_data["journey_details"]["date"] ?
		`${user_data["journey_details"]["date"].split("-").reverse().join("/")}` :
		"";
	dateInputField.dispatchEvent(new Event("keydown"));
	dateInputField.dispatchEvent(new Event("input"));

	const jClassField = form.querySelector("#journeyClass");
	const jClassArrowBtn = jClassField.querySelector("div > div[role='button']");
	jClassArrowBtn.click();
	[...jClassField.querySelectorAll("ul li")]
	.filter(
			(e) =>
			e.innerText === user_data["journey_details"]["class"]["label"] ?? ""
		)[0]
		?.click(); //handle error here

	const quotaField = form.querySelector("#journeyQuota");
	const quotaArrowBtn = quotaField.querySelector("div > div[role='button']");
	quotaArrowBtn.click();
	[...quotaField.querySelectorAll("ul li")]
	.filter(
			(e) =>
			e.innerText === user_data["journey_details"]["quota"]["label"] ?? ""
		)[0]
		?.click(); //handle error here

	const searchBtn = form.querySelector(
		"button.search_btn.train_Search[type='submit']"
	);
	statusUpdate("filled_journey_details");

	if (
		user_data["journey_details"]["quota"]["label"] === "TATKAL" ||
		(user_data["journey_details"]["quota"]["label"] === "PREMIUM TATKAL" &&
			user_data["extension_data"]["book_at_tatkal_time"] === true)
	) {
		const jclass = user_data["journey_details"]["class"]["value"];
		let currentDate = new Date();
		let requiredDate = new Date();
		["1A", "2A", "3A", "CC", "EC", "3E", "SL", "2S"].includes(jclass.toUpperCase()) ?
			requiredDate.setHours(10, 00, 00, 00) :
			requiredDate.setHours(11, 00, 00, 00);

		if (requiredDate > currentDate) {
			console.log("asdas");
			setTimeout(() => {
				searchBtn.click();
			}, 10);
		} else {
			searchBtn.click();
		}
	} else {
		searchBtn.click();
	}
}

function selectJourney() {
	if (!user_data["journey_details"]["train-no"]) return;

	statusUpdate("journey_selection_started");
	const train_list_parent = document.querySelector(
		"#divMain > div > app-train-list"
	);
	const train_list = [
		...train_list_parent.querySelectorAll(".tbis-div app-train-avl-enq"),
	];
	console.log(user_data["journey_details"]["train-no"]);
	const myTrain = train_list.filter((train) =>
		train
		.querySelector("div.train-heading")
		.innerText.trim()
		.includes(user_data["journey_details"]["train-no"])
	)[0];

	if (!myTrain) {
		statusUpdate("journey_selection_stopped.no_train");
		return;
	}

	const jClass = user_data["journey_details"]["class"]["label"];
	const tempDate = new Date(user_data["journey_details"]["date"])
		.toString()
		.split(" ");
	const myClassToClick = [
		...myTrain.querySelectorAll("table tr td div.pre-avl"),
	].filter((c) => c.querySelector("div").innerText === jClass)[0];

	const config = {
		attributes: false,
		childList: true,
		subtree: true
	};
	[...myTrain.querySelectorAll("table tr td div.pre-avl")]
	.filter((c) => c.querySelector("div").innerText === jClass)[0]
		?.click();

	const fetchAvailableSeatsCallback = (mutationList, observer) => {
		console.log("fetchAvailableSeatsCallback -1", Date.now());
		console.log("fetchAvailableSeatsCallback -2", Date.now());
		const myClassToClick = [
			...myTrain.querySelectorAll("table tr td div.pre-avl"),
		].filter((c) => c.querySelector("div").innerText === jClass)[0];
		const myClassTabToClick = [
			...myTrain.querySelectorAll(
				"div p-tabmenu ul[role='tablist'] li[role='tab']"
			),
		].filter((c) => c.querySelector("div").innerText === jClass)[0];
		const myClassTabToSelect = [
			...myTrain.querySelectorAll("div div table td div.pre-avl"),
		].filter(
			(c) =>
			c.querySelector("div").innerText ===
			`${tempDate[0]}, ${tempDate[2]} ${tempDate[1]}`
		)[0];

		const bookBtn = myTrain.querySelector(
			"button.btnDefault.train_Search.ng-star-inserted"
		);
		if (myClassToClick) {
			console.log(1);
			if (myClassToClick.classList.contains("selected-class")) {
				console.log(2);
				statusUpdate("journey_selection_completed");
				bookBtn.click();
				observer.disconnect();
			} else {
				console.log(3);
				myClassToClick.click();
			}
		} else if (myClassTabToClick) {
			console.log(4);
			if (!myClassTabToClick.classList.contains("ui-state-active")) {
				console.log(5);
				myClassTabToClick.click();
				return;
			} else if (myClassTabToSelect) {
				console.log(6);
				if (myClassTabToSelect.classList.contains("selected-class")) {
					console.log(7);
					bookBtn.click();
					observer.disconnect();
				} else {
					console.log(8, Date.now());
					myClassTabToSelect.click();
					console.log(9, Date.now());
				}
			}
		}
	};
	const observer = new MutationObserver(fetchAvailableSeatsCallback);
	observer.observe(myTrain, config);
}

function fillPassengerDetails() {
	statusUpdate("passenger_filling_started");
	const parentElement = document.querySelector("app-passenger-input");
	let count = 1;
	while (count < user_data["passenger_details"].length) {
		parentElement
			.querySelector(
				"#ui-panel-12-content div.zeroPadding.pull-left.ng-star-inserted a span.prenext"
			)
			?.click();
		count++;
	}
	count = 0;
	while (count < user_data["infant_details"].length) {
		parentElement
			.querySelector(
				"#ui-panel-12-content div.zeroPadding.text-right.ng-star-inserted > a > span.prenext"
			)
			.click();
		count++;
	}
	const passengerList = [...parentElement.querySelectorAll("app-passenger")];
	const infantList = [...parentElement.querySelectorAll("app-infant")];

	// passenger details
	user_data["passenger_details"].forEach((passenger, index) => {
		let name_input_field = passengerList[index].querySelector(
			"p-autocomplete[formcontrolname='passengerName'] input[placeholder='Passenger Name']"
		);
		name_input_field.value = passenger.name;
		name_input_field.dispatchEvent(new Event("input"));
		let age_input_field = passengerList[index].querySelector(
			"input[type='number'][formcontrolname='passengerAge']"
		);
		age_input_field.value = passenger.age;
		age_input_field.dispatchEvent(new Event("input"));
		let gender_select_field = passengerList[index].querySelector(
			"select[formcontrolname='passengerGender']"
		);
		gender_select_field.value = passenger.gender;
		gender_select_field.dispatchEvent(new Event("change"));
		let berth_select_field = passengerList[index].querySelector(
			"select[formcontrolname='passengerBerthChoice']"
		);
		berth_select_field.value = passenger.berth;
		berth_select_field.dispatchEvent(new Event("change"));
	});

	// infant details
	user_data["infant_details"].forEach((infant, index) => {
		let name_input_field = infantList[index].querySelector(
			"input#infant-name[name='infant-name']"
		);
		name_input_field.value = infant.name;
		name_input_field.dispatchEvent(new Event("input"));
		let age_select_field = infantList[index].querySelector(
			"select[formcontrolname='age']"
		);
		age_select_field.value = infant.age;
		age_select_field.dispatchEvent(new Event("change"));
		let gender_select_field = infantList[index].querySelector(
			"select[formcontrolname='gender']"
		);
		gender_select_field.value = infant.gender;
		gender_select_field.dispatchEvent(new Event("change"));
	});

	// contact details
	let number_input_field = parentElement.querySelector(
		"input#mobileNumber[formcontrolname='mobileNumber'][name='mobileNumber']"
	);
	number_input_field.value = user_data["contact_details"].mobileNumber;
	number_input_field.dispatchEvent(new Event("input"));

	// Other preferences
	let autoUpgradationInput = parentElement.querySelector(
		"input#autoUpgradation[type='checkbox'][formcontrolname='autoUpgradationSelected']"
	);
	if (autoUpgradationInput)
		autoUpgradationInput.checked =
		user_data["other_preferences"]["autoUpgradation"] ?? false;

	let confirmberthsInput = parentElement.querySelector(
		"input#confirmberths[type='checkbox'][formcontrolname='bookOnlyIfCnf']"
	);
	if (confirmberthsInput)
		confirmberthsInput.checked =
		user_data["other_preferences"]["confirmberths"] ?? false;

	let preferredCoachInput = parentElement.querySelector(
		"input[formcontrolname='coachId']"
	);
	if (preferredCoachInput)
		preferredCoachInput.value = user_data["other_preferences"]["coachId"];

	const reservationChoiceField = parentElement.querySelector(
		"p-dropdown[formcontrolname='reservationChoice']"
	);
	if (reservationChoiceField) {
		const reservationChoiceArrowBtn = reservationChoiceField.querySelector(
			"div > div[role='button']"
		);
		reservationChoiceArrowBtn.click();
		[...reservationChoiceField.querySelectorAll("ul li")]
		.filter(
				(e) =>
				e.innerText === user_data["other_preferences"]["reservationChoice"] ??
				""
			)[0]
			?.click(); //handle error here
	}
	// insurance details
	let insuranceOptionsRadios = [
		...parentElement.querySelectorAll(
			`p-radiobutton[formcontrolname='travelInsuranceOpted'] input[type='radio'][name='travelInsuranceOpted-0']`
		),
	];
	insuranceOptionsRadios
		.filter(
			(r) =>
			r.value ===
			(user_data["travel_preferences"].travelInsuranceOpted === "yes" ?
				"true" :
				"false")
		)[0]
		?.click();

	// payment details
	let paymentOptionsRadios = [
		...parentElement.querySelectorAll(
			`p-radiobutton[formcontrolname='paymentType'][name='paymentType'] input[type='radio']`
		),
	];
	paymentOptionsRadios
		.filter(
			(r) => r.value === user_data["payment_preferences"].paymentType.toString()
		)[0]
		?.click();

	// GSTIN details
	if (false) {
		addDelay(400);
		let gst_form = parentElement.querySelector("app-gst-input");
		let gstin_number_field = gst_form.querySelector("#gstin-number");
		gstin_number_field.value = user_data["gst_details"]["gstin-number"];
		gstin_number_field.dispatchEvent(new Event("input"));
		gstin_number_field.dispatchEvent(new Event("change")); // check if unnecessary
		let gstin_name_field = gst_form.querySelector("#gstin-name");
		let gstin_flat_field = gst_form.querySelector("#gstin-flat");
		let gstin_street_field = gst_form.querySelector("#gstin-street");
		let gstin_area_field = gst_form.querySelector("#gstin-area");
		let gstin_PIN_field = gst_form.querySelector("#gstin-PIN");
		let gstin_City_field = gst_form.querySelector("select#gstin-City");

		const config = {
			attributes: true,
			childList: true,
			subtree: true,
			attributeOldValue: true,
			characterDataOldValue: true,
		};
		const cityFetchCallback = (mutationList, observer) => {
			console.log("22");
			if (
				gstin_PIN_field.value.length === 6 &&
				gstin_City_field.querySelectorAll("option").length > 1
			) {
				observer.disconnect();
				console.log("22");
				// [...gstin_City_field.querySelectorAll("option")]
				//   .filter((e) => e.value === user_data["gst_details"]["gstin-City"])[0]
				//   ?.click();
				gstin_City_field.value = user_data["gst_details"]["gstin-City"];
				gstin_City_field.dispatchEvent(new Event("input"));
				gstin_City_field.dispatchEvent(new Event("change"));
				console.log("33");
				submitPassengerDetailsForm(parentElement);
			}
		};
		const observer = new MutationObserver(cityFetchCallback);
		observer.observe(gstin_City_field, config);

		gstin_name_field.value = user_data["gst_details"]["gstin-name"];
		gstin_name_field.dispatchEvent(new Event("input"));
		gstin_name_field.dispatchEvent(new Event("change"));
		gstin_flat_field.value = user_data["gst_details"]["gstin-flat"];
		gstin_flat_field.dispatchEvent(new Event("input"));
		gstin_flat_field.dispatchEvent(new Event("change"));
		gstin_street_field.value = user_data["gst_details"]["gstin-street"];
		gstin_street_field.dispatchEvent(new Event("input"));
		gstin_street_field.dispatchEvent(new Event("change"));
		gstin_area_field.value = user_data["gst_details"]["gstin-area"];
		gstin_area_field.dispatchEvent(new Event("input"));
		gstin_area_field.dispatchEvent(new Event("change"));
		gstin_PIN_field.value = user_data["gst_details"]["gstin-PIN"];
		gstin_PIN_field.dispatchEvent(new Event("input"));
		gstin_PIN_field.dispatchEvent(new Event("change"));
	} else {
		submitPassengerDetailsForm(parentElement);
	}
}

function submitPassengerDetailsForm(parentElement) {
	statusUpdate("passenger_filling_completed");
	logPassengerDetailsCompletion();

	const continueButton = parentElement.querySelector("button.train_Search");

	if (continueButton) {
		continueBooking(continueButton);
	} else {
		console.error("Continue button not found");
		statusUpdate("continue_button_not_found");
		return;
	}
}

function logPassengerDetailsCompletion() {
	console.log("Filling passenger details completed at", new Date().toLocaleTimeString());
	console.log("Document ready state:", document.readyState);
}

function continueBooking(continueButton) {
	continueButton.click();
	statusUpdate("passenger_data_submitting");
	console.log("Passenger data submitted");

	const targetURL = 'https://www.irctc.co.in/nget/booking/reviewBooking';
	const urlCheckInterval = setInterval(function() {
		if (document.URL === targetURL) {
			clearInterval(urlCheckInterval); // Stop further checking
			handleReviewBooking();
		}
	}, 500);
}

function handleReviewBooking() {
	const reviewBookingComponent = document.querySelector('app-review-booking');
	if (reviewBookingComponent) {
		console.log('Found app-review-booking component:', reviewBookingComponent);
		focusCaptchaInput(reviewBookingComponent);
	} else {
		console.error('app-review-booking component not found within #divMain container');
	}
}

function focusCaptchaInput(reviewBookingComponent) {
        const captchaInput = reviewBookingComponent.querySelector('input#captcha');
        if (captchaInput) {
            captchaInput.className = 'payment_tex ng-valid ng-dirty ng-touched'; // Set the class name
            captchaInput.focus();
		    console.log('Successfully focused on CAPTCHA input:', captchaInput);
            captchaInput.addEventListener("mouseenter", function() {
            const captcha = document.querySelector(".captcha-img").src;
            console.log("src ::",captcha);
            if (captcha == null) {
                alert("Please Wait...");
            } else {
                performOCRAndSetInputForReview(captcha);
            }
        });
		waitForPaymentOptions();
	} else {
		console.error('CAPTCHA input not found within app-review-booking component');
	}
}

function performOCRAndSetInputForReview(imageUrl) {
    console.log("Starting OCR process for image:", imageUrl);

    const apiKey = "K88263110488957";
    const apiUrl = "https://api.ocr.space/parse/image";

    fetch(imageUrl)
        .then(response => {
            return response.blob();
        })
        .then(blob => {
            console.log("Image file fetched successfully");
            const file = new File([blob], "captcha_image.png", { type: blob.type });
            const formData = new FormData();
            formData.append("language", "eng");
            formData.append("isOverlayRequired", "true");
            formData.append("file", file);

            console.log("Sending OCR request to:", apiUrl);

            return fetch(apiUrl, {
                method: "POST",
                headers: {
                    "apikey": apiKey
                },
                body: formData
            });
        })
        .then(response => {
            if (!response.ok) {
                throw new Error("OCR request failed");
            }
            return response.json();
        })
        .then(data => {
            console.log("OCR response received:", data);

            if (data.IsErroredOnProcessing) {
                throw new Error("OCR processing error");
            }

            const extractedText = data.ParsedResults[0].ParsedText.trim();
            console.log("Extracted text from OCR:", extractedText);

            const captchaInput = document.getElementById("captcha");
            if (captchaInput) {
            captchaInput.value = extractedText;
            const event = new Event('input', { bubbles: true });
            captchaInput.dispatchEvent(event);
            const button = document.querySelector('button.btnDefault.train_Search');
            if (button) {
                button.focus();
            } else {
                console.error('Button not found.');
            }
        } else {
            console.error("Captcha input element not found");
        }
        })
        .catch(error => {
            console.error("Error during OCR process:", error);
        });
}

function waitForPaymentOptions() {
	const targetPaymentOptionsURL = 'https://www.irctc.co.in/nget/payment/bkgPaymentOptions';
	if (window.location.href === targetPaymentOptionsURL) {
		console.log('Payment options URL matched:', targetPaymentOptionsURL);
		handlePaymentOptions();
	} else {
		setTimeout(waitForPaymentOptions, 1000);
	}
}

function handlePaymentOptions() {
	const paymentOptionsComponent = document.querySelector('app-payment-options');
	if (paymentOptionsComponent) {
		console.log('Found app-payment-options component:', paymentOptionsComponent);
		selectPaymentOption(paymentOptionsComponent);
	} else {
		console.error('app-payment-options component not found');
	}
}

function selectPaymentOption(paymentOptionsComponent) {
	const payTypeContainer = document.querySelector('#pay-type');
	if (payTypeContainer) {
		const multiplePaymentServiceDiv = payTypeContainer.querySelector('div.bank-type:nth-child(3)');
		if (multiplePaymentServiceDiv) {
			multiplePaymentServiceDiv.click();
			console.log('Clicked on Multiple Payment Service option');

			const paymentOptionsTable = paymentOptionsComponent.querySelector('table');
			if (paymentOptionsTable) {
				const paymentOptionDiv = Array.from(paymentOptionsTable.querySelectorAll('div.bank-text')).find((div) => {
					const textContent = div.textContent.trim();
					return textContent.includes('Pay using BHIM (Powered by PAYTM ) also accepts UPI');
				});

				if (paymentOptionDiv) {
					paymentOptionDiv.click();
					console.log('Clicked on Payment Option:', paymentOptionDiv.textContent.trim());
					const payAndBookButton = document.querySelector('button.btn-primary');
					if (payAndBookButton) {
						payAndBookButton.click();
						console.log('Clicked on Pay & Book button');
					} else {
						console.error('Pay & Book button not found');
					}
				} else {
					console.error('Desired payment option div not found');
				}
			} else {
				console.error('Payment options table not found within app-payment-options component');
			}
		} else {
			console.error('Multiple Payment Service div not found');
		}
	} else {
		console.error('#pay-type container not found');
	}
}



function continueScript() {
	statusUpdate("continue_script");
	const loginBtn = document.querySelector(
		"body > app-root > app-home > div.header-fix > app-header > div.col-sm-12.h_container > div.text-center.h_main_div > div.row.col-sm-12.h_head1 > a.search_btn.loginText.ng-star-inserted"
	);
	// fill data in respective form at different pages
	if (window.location.href.includes("train-search")) {
		if (loginBtn.innerText.trim().toUpperCase() === "LOGOUT") {
			loadJourneyDetails();
		}
		if (loginBtn.innerText.trim().toUpperCase() === "LOGIN") {
			loginBtn.click();
			loadLoginDetails();
		}
	} else if (window.location.href.includes("nget/booking/train-list")) {
		console.log("nget/booking/train-list");
	} else {
		console.log("No script ahead");
	}
}

window.onload = function(e) {
	const loginBtn = document.querySelector(
		"body > app-root > app-home > div.header-fix > app-header > div.col-sm-12.h_container > div.text-center.h_main_div > div.row.col-sm-12.h_head1 "
	);
	const config = {
		attributes: false,
		childList: true,
		subtree: false
	};
	const loginDetectorCallback = (mutationList, observer) => {
		if (
			mutationList.filter(
				(m) =>
				m.type === "childList" &&
				m.addedNodes.length > 0 && [...m.addedNodes].filter(
					(n) => n?.innerText?.trim()?.toUpperCase() === "LOGOUT"
				).length > 0
			).length > 0
		) {
			observer.disconnect();
			loadJourneyDetails();
		} else {
			loginBtn.click();
			loadLoginDetails();
		}
	};
	const observer = new MutationObserver(loginDetectorCallback);
	observer.observe(loginBtn, config);

	console.log("Content Script loaded with IRCTC Website");
	chrome.storage.local.get(null, (result) => {
		user_data = result;
		continueScript();
	});
};