const { createApp, ref, computed, onUnmounted } = Vue;

createApp({
	setup() {
		const mediaStream = ref(null);
		const mediaRecorder = ref(null);
		const recordedChunks = ref([]);
		const isRecording = ref(false);
		const isPaused = ref(false);
		const recordingTime = ref(0);
		const recordings = ref([]);
		const error = ref("");
		const recordingMode = ref("screen");
		const videoPreview = ref(null);
		const recordingInterval = ref(null);

		const formattedTime = computed(() => {
			const minutes = Math.floor(recordingTime.value / 60);
			const seconds = recordingTime.value % 60;
			return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
		});

		const hasStream = computed(() => mediaStream.value !== null);

		const startScreenShare = async () => {
			try {
				error.value = "";
				const displayStream = await navigator.mediaDevices.getDisplayMedia({
					video: { mediaSource: "screen" },
					audio: true,
				});

				if (recordingMode.value === "screen-camera") {
					try {
						const cameraStream = await navigator.mediaDevices.getUserMedia({
							video: true,
							audio: false,
						});

						const combinedStream = new MediaStream([...displayStream.getVideoTracks(), ...displayStream.getAudioTracks(), ...cameraStream.getVideoTracks()]);

						mediaStream.value = combinedStream;
					} catch (err) {
						console.error("Camera access denied:", err);
						mediaStream.value = displayStream;
					}
				} else {
					mediaStream.value = displayStream;
				}

				if (videoPreview.value) {
					videoPreview.value.srcObject = mediaStream.value;
				}

				// Auto-record when screen sharing starts
				startRecording();

				mediaStream.value.getVideoTracks()[0].addEventListener("ended", () => {
					stopScreenShare();
				});
			} catch (err) {
				console.error("Error accessing display media:", err);
				error.value = "Failed to access screen. Please grant permission and try again.";
			}
		};

		const stopScreenShare = () => {
			if (isRecording.value) {
				stopRecording();
			}

			if (mediaStream.value) {
				mediaStream.value.getTracks().forEach((track) => track.stop());
				mediaStream.value = null;
			}

			if (videoPreview.value) {
				videoPreview.value.srcObject = null;
			}
		};

		const startRecording = () => {
			if (!mediaStream.value) return;

			try {
				recordedChunks.value = [];

				const possibleMimeTypes = ["video/x-matroska;codecs=h264", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"];

				let selectedMimeType = null;
				for (const type of possibleMimeTypes) {
					if (MediaRecorder.isTypeSupported(type)) {
						selectedMimeType = type;
						break;
					}
				}

				if (!selectedMimeType) {
					throw new Error("No supported MIME type found for MediaRecorder.");
				}

				const options = { mimeType: selectedMimeType, videoBitsPerSecond: 8000000 };

				mediaRecorder.value = new MediaRecorder(mediaStream.value, options);

				mediaRecorder.value.ondataavailable = (event) => {
					if (event.data.size > 0) {
						recordedChunks.value.push(event.data);
					}
				};

				mediaRecorder.value.onstop = () => {
					const blob = new Blob(recordedChunks.value, { type: "video/webm" });
					const url = URL.createObjectURL(blob);
					const timestamp = new Date().toLocaleString();

					recordings.value.push({
						id: Date.now(),
						url,
						blob,
						timestamp,
						duration: recordingTime.value,
					});

					// Sort recordings by newest first
					recordings.value.sort((a, b) => b.id - a.id);

					recordedChunks.value = [];
				};

				mediaRecorder.value.start(1000);
				isRecording.value = true;
				recordingTime.value = 0;

				recordingInterval.value = setInterval(() => {
					if (!isPaused.value) {
						recordingTime.value++;
					}
				}, 1000);
			} catch (err) {
				console.error("Error starting recording:", err);
				error.value = "Failed to start recording. Please try again.";
			}
		};

		const stopRecording = () => {
			if (mediaRecorder.value && isRecording.value) {
				mediaRecorder.value.stop();
				isRecording.value = false;
				isPaused.value = false;

				if (recordingInterval.value) {
					clearInterval(recordingInterval.value);
					recordingInterval.value = null;
				}
			}
		};

		const togglePause = () => {
			if (!mediaRecorder.value || !isRecording.value) return;

			if (isPaused.value) {
				mediaRecorder.value.resume();
				isPaused.value = false;
			} else {
				mediaRecorder.value.pause();
				isPaused.value = true;
			}
		};

		const downloadRecording = (recording) => {
			const a = document.createElement("a");
			a.href = recording.url;
			a.download = `screen-recording-${recording.id}.webm`;
			a.click();
		};

		const deleteRecording = (id) => {
			const index = recordings.value.findIndex((r) => r.id === id);
			if (index !== -1) {
				URL.revokeObjectURL(recordings.value[index].url);
				recordings.value.splice(index, 1);
			}
		};

		onUnmounted(() => {
			stopScreenShare();
			if (recordingInterval.value) {
				clearInterval(recordingInterval.value);
			}
			recordings.value.forEach((recording) => {
				URL.revokeObjectURL(recording.url);
			});
		});

		return {
			mediaStream,
			isRecording,
			isPaused,
			recordingTime,
			recordings,
			error,
			recordingMode,
			videoPreview,
			formattedTime,
			hasStream,
			startScreenShare,
			stopScreenShare,
			startRecording,
			stopRecording,
			togglePause,
			downloadRecording,
			deleteRecording,
		};
	},
}).mount("#app");
