import html2canvas from "html2canvas";
import _ from "lodash";
import {
  all,
  call,
  debounce,
  fork,
  put,
  select,
  takeLatest,
} from "redux-saga/effects";
import { ArtEventType } from "../../functions/constants";
import createPallette, {
  getDefaultPictureBySize,
} from "../../functions/createPallette";
import { InvitationEventType } from "../../functions/hooks/useInivitationRealtime";
import realtimeService from "../realtime/realtimeService";
import pixelService from "./pixelService";
import { pixelActions } from "./pixelSlice";
import { uploadFileSaga } from "../file/fileSaga";

// let webWorker;

function* createSaga({ payload: { name, size, onSuccess, onFailure } }) {
  try {
    const user = yield select((state) => state.auth.user);

    const body = {
      name,
      pallette: JSON.stringify(createPallette(size)),
      userName: user.name,
      userProfilePicture: user.profilePicture,
      userSlug: user.slug,
      size,
      picture: getDefaultPictureBySize(size),
    };

    const { data, errors } = yield call(pixelService.create, body);
    if (errors) {
      throw errors;
    }

    if (_.isFunction(onSuccess)) onSuccess(data.slug);
  } catch (e) {
    if (_.isFunction(onFailure)) onFailure(e);
  }
}

function* getPixelBySlugSaga({ payload: { slug, onSuccess, onFailure } }) {
  try {
    const { data, errors } = yield call(pixelService.getBySlug, slug);
    if (errors) {
      throw errors;
    }

    yield put(pixelActions.updatePixels({ key: data.slug, value: data }));
    yield put(pixelActions.setPixel(JSON.parse(data?.pallette)));
    if (_.isFunction(onSuccess)) onSuccess();
  } catch (e) {
    if (_.isFunction(onFailure)) onFailure(e);
  }
}

function* getConnectionBySlugSaga({
  payload: { slug, userId, onSuccess, onFailure },
}) {
  try {
    const { data, errors } = yield call(
      pixelService.getConnectionBySlug,
      slug,
      userId
    );
    if (errors) {
      throw errors;
    }

    yield put(
      pixelActions.updatePixelConnections({ key: data.pixelSlug, value: data })
    );
    yield put(
      pixelActions.updatePixels({
        key: data.pixelArt.slug,
        value: data.pixelArt,
      })
    );
    if (_.isFunction(onSuccess)) onSuccess(data.isOwner);
  } catch (e) {
    if (_.isFunction(onFailure)) onFailure(e);
  }
}

function* savePixelSaga({ payload: { slug, onSuccess, onFailure } }) {
  try {
    // yield fork(savePictureWithWorker, slug);
    const pixelPallette = yield select((state) => state.pixel.pixel);

    // webWorker.postMessage({
    //   slug,
    //   pallette: JSON.stringify(pixelPallette),
    // });

    const { data, errors } = yield call(
      pixelService.draw,
      slug,
      JSON.stringify(pixelPallette)
    );
    if (errors) {
      throw errors;
    }

    if (_.isFunction(onSuccess)) onSuccess();
  } catch (e) {
    console.error(e);
    if (_.isFunction(onFailure)) onFailure(e);
  }
}

function* savePictureWithWorker(slug) {
  const canvas = yield call(
    html2canvas,
    document.querySelector("#pixel-table")
  );
  const blob = yield call((cn) => {
    return new Promise(function (resolve, reject) {
      cn.toBlob(function (blob) {
        resolve(blob);
      });
    });
  }, canvas);

  // const { errors: pictureErrors } = yield call(
  //   pixelService.changePixelPicture,
  //   slug,
  //   `pixel_${slug}`,
  //   blob
  // );
  // console.log({ pictureErrors });
  // webWorker.postMessage({
  //   slug,
  //   blob,
  // });
}

function* savePictureSaga(pixelSlug) {
  try {
    const canvas = yield call(
      html2canvas,
      document.querySelector("#pixel-table")
    );
    const blob = yield call((cn) => {
      return new Promise(function (resolve, reject) {
        cn.toBlob(function (blob) {
          resolve(blob);
        });
      });
    }, canvas);

    const {
      data: { publicPath },
      errors: fileErrors,
    } = yield call(uploadFileSaga, { name: `pixel_${pixelSlug}`, file: blob });
    if (fileErrors) {
      throw fileErrors;
    }

    const { errors: pictureErrors } = yield call(
      pixelService.updatePixelPicture,
      pixelSlug,
      publicPath
    );
    if (pictureErrors) {
      throw pictureErrors;
    }

    const globalPixel = yield select(({ pixel }) =>
      _.get(pixel.globalPixels, pixelSlug)
    );
    yield put(
      pixelActions.updateGlobalPixels({
        key: pixelSlug,
        value: {
          ...globalPixel,
          picture: publicPath,
        },
      })
    );

    const userArt = yield select(({ pixel }) =>
      _.get(pixel.userArts, pixelSlug)
    );
    yield put(
      pixelActions.updateUserArt({
        key: pixelSlug,
        value: {
          ...userArt,
          pixelPicture: publicPath,
        },
      })
    );
  } catch (e) {
    console.error({ e });
  }
}

function* getGlobalPixelsSaga({
  payload: { searchText, isNewSearch, onSuccess, onFailure },
}) {
  try {
    const info = yield select(({ pixel }) => pixel.info);
    const searchedText = yield select(({ pixel }) => pixel.searchText);
    const page = _.isNil(info) || isNewSearch ? 1 : info.currentPage + 1;

    if (isNewSearch || _.isNil(info) || info?.currentPage < info?.totalPages) {
      const { data, errors } = yield call(pixelService.getGlobalPixels, {
        searchText: isNewSearch ? searchText : searchedText,
        page,
      });
      if (errors) {
        throw errors;
      }
      let newGlobalPixels = {};

      if (!_.isEmpty(data?.data)) {
        for (const art of data?.data) {
          newGlobalPixels[art.slug] = art;
        }
      }
      if (isNewSearch) {
        yield put(pixelActions.setSearchText(searchText));
      }
      yield put(
        pixelActions.setGlobalPixels({
          data: newGlobalPixels,
          page,
        })
      );
      yield put(pixelActions.setInfo(data?.info));
    }

    if (_.isFunction(onSuccess)) onSuccess();
  } catch (e) {
    if (_.isFunction(onFailure)) onFailure(e);
  }
}

function* getUserArtsSaga({
  payload: { userSlug, searchText, isNewSearch, onSuccess, onFailure },
}) {
  try {
    const info = yield select(({ pixel }) => pixel.userArtsInfo);
    const searchedText = yield select(({ pixel }) => pixel.userArtsSearchText);
    const page = _.isNil(info) || isNewSearch ? 1 : info.currentPage + 1;

    if (isNewSearch || _.isNil(info) || info?.currentPage < info?.totalPages) {
      const { data, errors } = yield call(pixelService.getUserArts, {
        userSlug,
        searchText: isNewSearch ? searchText : searchedText,
        page,
      });
      if (errors) {
        throw errors;
      }
      let newUserArts = {};

      if (!_.isEmpty(data?.data)) {
        for (const artConnection of data?.data) {
          newUserArts[artConnection.pixelSlug] = artConnection;
        }
      }
      if (isNewSearch) {
        yield put(pixelActions.setUserArtsSearchText(searchText));
      }
      yield put(
        pixelActions.setUserArts({
          data: newUserArts,
          page,
        })
      );
      yield put(pixelActions.setUserArtsInfo(data?.info));
    }

    if (_.isFunction(onSuccess)) onSuccess();
  } catch (e) {
    if (_.isFunction(onFailure)) onFailure(e);
  }
}

function* sendInviteSaga({
  payload: { email, pixelId, pixelName, onSuccess, onFailure },
}) {
  try {
    const { errors } = yield call(pixelService.sendInvite, email, pixelId);
    if (errors) {
      throw errors;
    }

    realtimeService.sendMessage(email, InvitationEventType.INVITE_MEMBER, {
      invitedEmail: email,
      pixelId,
      pixelName,
    });
    if (_.isFunction(onSuccess)) onSuccess();
  } catch (e) {
    if (_.isFunction(onFailure)) onFailure(e);
  }
}

function* joinPixelSaga({ payload: { email, pixelId, onSuccess, onFailure } }) {
  try {
    const { data, errors } = yield call(pixelService.joinPixel, email, pixelId);
    if (errors) {
      throw errors;
    }

    if (_.isFunction(onSuccess)) onSuccess(data.slug);
  } catch (e) {
    if (_.isFunction(onFailure)) onFailure(e);
  }
}

function* getPixelDrawersSaga({
  payload: { pixelSlug, searchText, isNewSearch, onSuccess, onFailure },
}) {
  try {
    const info = yield select(({ pixel }) => pixel.pixelDrawersInfo);
    const searchedText = yield select(
      ({ pixel }) => pixel.pixelDrawersSearchText
    );
    const page = _.isNil(info) || isNewSearch ? 1 : info.currentPage + 1;

    if (isNewSearch || _.isNil(info) || info?.currentPage < info?.totalPages) {
      const { data, errors } = yield call(pixelService.getPixelDrawers, {
        pixelSlug,
        searchText: isNewSearch ? searchText : searchedText,
        page,
      });
      if (errors) {
        throw errors;
      }
      let newPixelDrawers = {};

      if (!_.isEmpty(data?.data)) {
        for (const pixelConnection of data?.data) {
          newPixelDrawers[pixelConnection.user._id] = pixelConnection.user;
        }
      }
      if (isNewSearch) {
        yield put(pixelActions.setSearchText(searchText));
      }
      yield put(
        pixelActions.setPixelDrawers({
          data: newPixelDrawers,
          page,
        })
      );
      yield put(pixelActions.setPixelDrawersInfo(data?.info));
    }

    if (_.isFunction(onSuccess)) onSuccess();
  } catch (e) {
    if (_.isFunction(onFailure)) onFailure(e);
  }
}

function* updatePixelNameSaga({
  payload: { pixelId, pixelSlug, name, onSuccess, onFailure },
}) {
  try {
    const { errors } = yield call(pixelService.updatePixelName, pixelId, name);
    if (errors) {
      throw errors;
    }

    const pixelConn = yield select((state) =>
      _.get(state.pixel.pixelConnections, pixelSlug)
    );
    const pixel = yield select((state) => _.get(state.pixel.pixels, pixelSlug));

    yield put(
      pixelActions.updatePixelConnections({
        key: pixelSlug,
        value: {
          ...pixelConn,
          pixelName: name,
          pixelArt: {
            ...pixel,
            name,
          },
        },
      })
    );
    yield put(
      pixelActions.updatePixels({
        key: pixelSlug,
        value: {
          ...pixel,
          name,
        },
      })
    );

    const realtimeKey = yield select(({ realtime }) => realtime.realtimeKey);
    realtimeService.sendMessage(pixelSlug, ArtEventType.UPDATED_NAME, {
      sent: realtimeKey,
      data: {
        pixelSlug,
        name,
      },
    });
    if (_.isFunction(onSuccess)) onSuccess();
  } catch (e) {
    if (_.isFunction(onFailure)) onFailure(e);
  }
}

function* removePixelArtSaga({
  payload: { pixelId, pixelSlug, onSuccess, onFailure },
}) {
  try {
    const { errors } = yield call(pixelService.removePixelArt, pixelId);
    if (errors) {
      throw errors;
    }

    yield put(
      pixelActions.removePixelConnections({
        key: pixelSlug,
      })
    );
    yield put(
      pixelActions.removePixels({
        key: pixelSlug,
      })
    );

    const realtimeKey = yield select(({ realtime }) => realtime.realtimeKey);
    realtimeService.sendMessage(pixelSlug, ArtEventType.DELETED, {
      sent: realtimeKey,
    });
    if (_.isFunction(onSuccess)) onSuccess();
  } catch (e) {
    if (_.isFunction(onFailure)) onFailure(e);
  }
}

function* deleteMemberSaga({
  payload: { pixelId, pixelSlug, memberId, onSuccess, onFailure },
}) {
  try {
    const { errors } = yield call(pixelService.deleteMember, pixelId, memberId);
    if (errors) {
      throw errors;
    }

    const user = yield select(({ auth }) => auth.user);
    if (user._id !== memberId) {
      yield put(
        pixelActions.removePixelDrawers({
          key: memberId,
        })
      );
      const pixelConn = yield select((state) =>
        _.get(state.pixel.pixelConnections, pixelSlug)
      );
      yield put(
        pixelActions.updatePixelConnections({
          key: pixelSlug,
          value: {
            ...pixelConn,
            pixelArt: {
              ...pixelConn.pixelArt,
              drawerSize: pixelConn.pixelArt.drawerSize - 1,
            },
          },
        })
      );
    }

    const realtimeKey = yield select(({ realtime }) => realtime.realtimeKey);
    realtimeService.sendMessage(pixelSlug, ArtEventType.REMOVE_MEMBER, {
      sent: realtimeKey,
      data: memberId,
    });
    if (_.isFunction(onSuccess)) onSuccess();
  } catch (e) {
    if (_.isFunction(onFailure)) onFailure(e);
  }
}

export default function* rootSaga() {
  // webWorker = new Worker(new URL("../../functions/worker", import.meta.url));
  yield all([
    takeLatest(pixelActions.createRequest.type, createSaga),
    takeLatest(pixelActions.getPixelBySlugRequest.type, getPixelBySlugSaga),
    takeLatest(
      pixelActions.getConnectionBySlugRequest.type,
      getConnectionBySlugSaga
    ),
    debounce(800, pixelActions.savePixelRequest.type, savePixelSaga),
    takeLatest(pixelActions.getGlobalPixelsRequest.type, getGlobalPixelsSaga),
    debounce(
      800,
      pixelActions.getGlobalPixelsSearchRequest.type,
      getGlobalPixelsSaga
    ),
    takeLatest(pixelActions.getUserArtsRequest.type, getUserArtsSaga),
    takeLatest(pixelActions.sendInviteRequest.type, sendInviteSaga),
    takeLatest(pixelActions.joinPixelRequest.type, joinPixelSaga),
    takeLatest(pixelActions.getPixelDrawersRequest.type, getPixelDrawersSaga),
    takeLatest(pixelActions.updatePixelNameRequest.type, updatePixelNameSaga),
    takeLatest(pixelActions.removePixelArtRequest.type, removePixelArtSaga),
    debounce(
      800,
      pixelActions.getPixelDrawersSearchRequest.type,
      getPixelDrawersSaga
    ),
    takeLatest(pixelActions.deleteMemberRequest.type, deleteMemberSaga),
  ]);
}
