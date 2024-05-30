let scriptActivated = false;
let tabDetails;
let status_updates = {};

function getMsg(msg_type, msg_body) {
  return {
    msg: {
      type: msg_type,
      data: msg_body,
    },
    sender: "popup",
    id: "irctc",
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Received message:", message);
  console.log("Sender details:", sender);
  console.log("Background script received a message");

  if (message.id !== "irctc") {
    console.log("Invalid message ID. Sending response...");
    sendResponse("Invalid Id");
    return;
  }

  const type = message.msg.type;
  const data = message.msg.data;

  if (type === "activate_script") {
    console.log("Received activation request. Creating new tab...");
    chrome.tabs.create(
      {
        url: "https://www.irctc.co.in/nget/train-search",
      },
      (tab) => {
        console.log("New tab created. Tab details:", tab);
        tabDetails = tab;
        console.log("Executing content script on the new tab...");
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["./content_script.js"]
        });
      }
    );
    sendResponse("Script activated");
  } else if (type === "status_update") {
    console.log("Received status update message. Updating status_updates object...");
    if (!status_updates[sender.id]) status_updates[sender.id] = [];

    status_updates[sender.id].push({
      sender: sender,
      data,
    });
    console.log("Status updates:", status_updates);
  } else {
    console.log("Unrecognized message type. Something went wrong.");
    sendResponse("Something went wrong");
  }
});


chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  console.log("Tab updated. TabId:", tabId, "ChangeInfo:", changeInfo, "Tab:", tab);

  // Check if the updated tab matches the stored tabDetails and has completed loading
  if (tabId === tabDetails?.id && changeInfo?.status === "complete") {
    console.log("Tab load complete. URL:", tab.url);
    if (tab.url.includes("booking/train-list")) {
      console.log("URL includes 'booking/train-list'. Sending 'selectJourney' message...");
      chrome.tabs.sendMessage(tabDetails.id, getMsg("selectJourney"));
    }

    // Check if the tab URL includes "booking/psgninput"
    if (tab.url.includes("booking/psgninput")) {
      console.log("URL includes 'booking/psgninput'. Sending 'fillPassengerDetails' message...");
      chrome.tabs.sendMessage(tabDetails.id, getMsg("fillPassengerDetails"));
    }
  }
});


// On installing the extension
chrome.runtime.onInstalled.addListener((reason) => {
  if (reason === chrome.runtime.OnInstalledReason.INSTALL) {
    chrome.tabs.create({
      url: "onboarding.html",
    });
  }
});
// chrome.tabs.create(
//   createProperties: object,
//   callback?: function,
// )

// open irctc page  - https://www.irctc.co.in/nget/train-search
// set localStorage for search history of journey
// reload the page
// login the users at 11.00 / 10.00
// set journey details
// click Search

// route changes to - https://www.irctc.co.in/nget/booking/train-list
// select journey class
// select date
// click book now

// route changes - https://www.irctc.co.in/nget/booking/psgninput
// Fill passenger details, contact_details, other details

// route changes - https://www.irctc.co.in/nget/booking/reviewBooking
// Fill captach

// route changes - https://www.irctc.co.in/nget/payment/bkgPaymentOptions
// Fill captach
